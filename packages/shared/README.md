# Shared

Code every service uses, so they all start, log, fail and check sign-ins the same way.

## A service from the starter

```js
import express from "express";
import {
  connectEvents,
  createApp,
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";

const config = loadConfig({
  PORT: { type: "port", default: 3002 },
  LOG_LEVEL: { default: "info" },
  RABBITMQ_URL: { type: "url" },
  AUTH_PUBLIC_KEY: { type: "pem" },
  INTERNAL_TOKEN: {},
});
const logger = createLogger({ service: "catalog", level: config.LOG_LEVEL });
const events = await connectEvents({
  url: config.RABBITMQ_URL,
  service: "catalog",
  logger,
});

const routes = express.Router();
routes.get("/catalog/faq", async (req, res) => {
  res.json(await loadFaq());
});

const app = createApp({
  service: "catalog",
  logger,
  routes,
  auth: {
    verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
    internalToken: config.INTERNAL_TOKEN,
  },
  ready: { events: events.isReady },
});
await startService({ app, port: config.PORT, logger, onStop: events.close });
```

`example/` is a working copy of this with two routes, and `test/example.test.js` starts it.

## What's in it

| Piece                                                  | What it does                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `loadConfig`                                           | Reads environment variables. If any are missing or wrong, the service stops at start-up and lists them all.                                                              |
| `createLogger`                                         | JSON logs with pino. The request ID (or event ID) goes on every line by itself. Tokens, cookies and sign-in codes are hidden.                                            |
| `createApp`                                            | Express with helmet, a request ID, `/health`, `/ready`, a body size limit, the spec validator, the spec's token and role rules, and errors in the spec's `Error` format. |
| `startService`                                         | Listens, and on SIGTERM turns `/ready` to 503, lets open requests finish, then runs `onStop`.                                                                            |
| `HttpError`, `badRequest`, `notFound`, `conflict`, …   | Errors to throw from routes. Anything else becomes a 500 with a safe message, and the stack goes only to the logs.                                                       |
| `createTokenVerifier`, `requireAuth`, `requireRole`    | Check auth's Ed25519 tokens with jose. `createApp` already applies them from the spec, so routes rarely need them.                                                       |
| `requireInternalToken`                                 | Checks `X-Internal-Token` on calls between services.                                                                                                                     |
| `connectEvents`                                        | Publishes and consumes events on RabbitMQ, reconnects by itself, retries failed events and dead-letters them after 5 tries.                                              |
| `createTestKeys` (from `@yais-kitchen/shared/testing`) | A throwaway key pair for tests, to sign tokens the way auth does.                                                                                                        |

## Rules

- Routes use the spec's paths without `/api`, such as `/catalog/yais`. The gateway takes `/api` off.
- A path or field that isn't in `openapi.yaml` gets a 404 or 400. Change the spec first, then the route.
- Don't check roles in routes: `x-roles` in the spec already does. Do check ownership in the route, for example that a family only sees its own Yai.
- `/health` says the process is up. `/ready` says it can do its job; pass a check for each database or broker it needs.
- Throw the errors from `errors.js` so the user gets a clear message. Never put internal details in a message.
- Log with `logger` and never log sign-in codes, tokens or passwords.
- `req.rawBody` holds the exact bytes, for webhook signatures.
- In tests, turn on `validateResponses: true`, so a response that doesn't match the spec fails.

## Events

```js
await events.consume({
  "auth.code_requested": sendSignInCode,
  "booking.confirmed": sendConfirmation,
});

await events.publish("application.received", { applicationId, email });
```

- Call `consume` once per service with every handler. The service reads from its own queue, named after the service.
- An event can arrive twice. Save `event.id` and skip one you have already handled.
- If a handler throws, the event comes back after 5, 10, 20 and 40 seconds. After the 5th failure it goes to `yais.events.dead`, with the error in its `x-error` header.
- `publish` resolves once RabbitMQ has the event. If the broker is down it throws a 503, so the caller can try again.
- Inside a request, the request ID travels with the event, so one ID links the logs of every service it touched.

## Commands

From the repo root:

| Command                                                                            | What it does                                                   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                                         | Runs every test. The RabbitMQ test is skipped.                 |
| `RABBITMQ_URL=amqp://guest:guest@localhost:5672 npm test`                          | Also runs the RabbitMQ test, against the broker from `infra/`. |
| `AUTH_PUBLIC_KEY="$(cat auth-public.pem)" npm run example -w @yais-kitchen/shared` | Runs the example service on port 3099.                         |

To make a key pair for running locally:

```bash
openssl genpkey -algorithm ed25519 -out auth-private.pem
openssl pkey -in auth-private.pem -pubout -out auth-public.pem
```

Keep both files out of git. `.gitignore` already ignores `*.pem`.
