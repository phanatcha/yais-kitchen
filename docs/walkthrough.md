# A walk through the back end

About an hour, for whoever looks after the gateway, auth, catalog and notification next. Do it with the stack running, so every step can be seen happen.

## 1. Start from a fresh clone (10 minutes)

Clone the repository into a new folder, then from inside it:

```bash
npm install && npm run setup && npm run up
```

```bash
npm run seed -w @yais-kitchen/catalog
```

`infra/README.md` explains each step, every address, and how to work on one service at a time. Open these in a browser and keep them open:

- http://localhost:8025, Mailpit, where every email lands
- http://localhost:15672, RabbitMQ (user and password `guest`), to watch events pass through
- http://localhost:8080/api/catalog/yais, the sample Yais through the gateway

## 2. The spec is the contract (15 minutes)

Everything starts in `packages/api-spec`.

- **`openapi.yaml`** is every HTTP endpoint. The gateway and every service check each request against it, and in tests each answer too. A path, field or status code that isn't in the spec doesn't work, so **the spec changes first and the code follows**.
- Read one operation together, such as `requestSignInCode` (`POST /auth/codes`). Besides the usual parts, three extensions do real work:
  - `x-roles`: who may call it. An empty list means anyone. `createApp` enforces it, so routes never check roles themselves.
  - `x-rate-limit`: one rule or a list, by `email`, `ip` or `user`. Only the gateway counts these.
  - `security`: `[]` for no token, `[{}, bearerAuth]` for an optional token, `internalToken` for `/internal` paths between services, `refreshCookie` for the refresh cookie.
- **`/internal` paths** are for services calling each other with `X-Internal-Token`. The gateway answers 404 for them, always.
- **`asyncapi.yaml`** is every event on RabbitMQ: its name, its fields and who sends it. `publish` refuses an event that doesn't match, and a received one that doesn't match goes to the dead-letter queue.
- **The mock server** (port 4010) answers from the spec for services that aren't built yet, so the web app can call booking and payment today.
- `npm run lint` also lints the spec. Whoever owns the spec reviews every change to it.

## 3. The shared package (15 minutes)

`packages/shared` is why the four services look alike. Read `packages/shared/README.md`, then walk through `createApp` in `packages/shared/src/service.js`. Every request goes through, in this order:

1. `helmet`, then a request ID (kept from `X-Request-Id` or made new), put on every log line
2. One log line per request
3. The JSON body, with a size limit
4. The spec validator: wrong paths, fields or queries stop here with 400, 404 or 405, before any token is checked
5. `authorizeFromSpec` (`src/auth.js`): the token, the role from `x-roles`, or the internal token
6. The service's routes
7. `errorHandler` (`src/errors.js`): every error leaves in the spec's `Error` shape. Unknown errors become a safe 500, and the stack goes only to the logs.

Then, more briefly:

- `loadConfig`: a service stops at start-up and lists every missing or wrong variable.
- `createLogger`: tokens, cookies, passwords and sign-in codes are hidden.
- `connectEvents` (`src/events.js`): one exchange, `yais.events`, with the event type as the routing key and one queue per service. A failing handler is tried again, then the event goes to the dead-letter queue. The request ID travels inside the event.
- `@yais-kitchen/shared/testing`: `createTestKeys()` signs tokens for any role in tests.

## 4. One request, from the web app to an email (15 minutes)

Follow a sign-in code. Send it with a request ID you choose, so it is easy to find:

```bash
curl -i -X POST http://localhost:8080/api/auth/codes \
  -H 'content-type: application/json' -H 'x-request-id: walkthrough-1' \
  -d '{"email":"you@example.com"}'
```

| Step | Where                                                              | What happens                                                                                                                   |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Web app                                                            | Calls `POST /api/auth/codes` on the gateway, the only address it knows                                                         |
| 2    | `services/gateway/src/app.js`                                      | CORS for the web app, then the spec check. `x-roles` is empty, so no token is needed.                                          |
| 3    | `services/gateway/src/rate-limit.js`                               | Both `x-rate-limit` rules: 5 per email and 20 per address every 15 minutes                                                     |
| 4    | `services/gateway/src/proxy.js`                                    | Takes `/api` off and forwards to auth with the same request ID                                                                 |
| 5    | `services/auth/src/app.js`, route `/auth/codes`                    | Auth checks the request against the spec again, since it can't trust that the gateway did                                      |
| 6    | `services/auth/src/auth.js`, `requestCode`                         | Makes the code, stores only its HMAC hash, publishes `auth.code_requested`, and answers 202 once RabbitMQ has the event        |
| 7    | RabbitMQ                                                           | `yais.events` routes the event to notification's queue                                                                         |
| 8    | `services/notification/src/notification.js`, `auth.code_requested` | Checks the event against `asyncapi.yaml`, skips it if it was handled before, claims the email so it is sent once, and sends it |
| 9    | Mailpit                                                            | The email with the code is at http://localhost:8025                                                                            |

Now see the same request ID in three services' logs:

```bash
docker compose -f infra/docker-compose.yml logs gateway auth notification | grep walkthrough-1
```

There is one line from each, and the code itself is in none of them. Finish the sign-in with the code from Mailpit:

```bash
curl -i -X POST http://localhost:8080/api/auth/sessions \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'
```

The answer has an access token and sets the `yk_refresh` cookie. `infra/stack.test.js` does this whole trace on every pull request.

## 5. Making a change (5 minutes)

1. Make a branch named for the work, such as `faq-order`.
2. If the API changes, change `openapi.yaml` or `asyncapi.yaml` first.
3. Write or change the test, then the code. `npm test` runs every test in a few seconds. Each service's README says how to run its tests against real RabbitMQ, MongoDB and Mailpit too.
4. `npm run lint` and `npm test`. The git hook lints every commit anyway.
5. Open a pull request. CI runs two jobs: `check` (lint and every test, with real RabbitMQ, MongoDB and Mailpit) and `stack` (`docker compose up` on a clean machine, then `infra/stack.test.js`). Both must pass, and one review is needed.

A good first change is small and touches one service, such as the wording of one email in `services/notification/src/emails.js` and its test.

## Where to read more

| Topic                                     | Read                              |
| ----------------------------------------- | --------------------------------- |
| Running everything                        | `infra/README.md`                 |
| The gateway, limits, test tokens          | `services/gateway/README.md`      |
| Sign-in, tokens, accounts                 | `services/auth/README.md`         |
| Yais, classes, class times, the rules     | `services/catalog/README.md`      |
| Emails, reminders, how events are handled | `services/notification/README.md` |
| Writing a new service                     | `packages/shared/README.md`       |
