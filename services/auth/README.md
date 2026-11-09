# Auth

Signs people in with a 6-digit code sent by email, gives out tokens, and keeps the list of accounts. Every other service checks its tokens with auth's public key, so they never call auth to ask who someone is.

## Signing in

1. `POST /auth/codes` with an email. Auth makes a 6-digit code, keeps only its hash for 10 minutes, and sends `auth.code_requested`. Notification emails the code. The answer is always 202, so nobody can find out who has an account.
2. `POST /auth/sessions` with the email and the code. The right code gives a 15-minute access token and sets the `yk_refresh` cookie for 30 days. The first sign-in for an email makes a tourist account, named after the start of the email until the person changes it.
3. `POST /auth/sessions/refresh` swaps the cookie for a new one and a new access token. The web app calls it when the access token runs out.
4. `DELETE /auth/sessions/current` signs out on this device.

A 401 from step 2 says why in `error.code`:

| Code           | What happened                               | What the person does |
| -------------- | ------------------------------------------- | -------------------- |
| `wrong_code`   | Not the code that was sent, or already used | Types it again       |
| `code_expired` | More than 10 minutes since it was sent      | Asks for a new code  |
| `code_locked`  | 5 wrong tries in a row on this code         | Asks for a new code  |

## Endpoints

Paths as the gateway shows them, under `/api`. `openapi.yaml` has every field and answer.

| Endpoint                        | Who                    | What                                       |
| ------------------------------- | ---------------------- | ------------------------------------------ |
| `POST /auth/codes`              | Anyone                 | Email a sign-in code                       |
| `POST /auth/sessions`           | Anyone                 | Sign in with the code                      |
| `POST /auth/sessions/refresh`   | Anyone with the cookie | New access token and cookie                |
| `DELETE /auth/sessions/current` | Anyone with the cookie | Sign out on this device                    |
| `POST /auth/guest-sessions`     | Anyone                 | A guest token for checkout                 |
| `GET /auth/me`                  | Signed in, not guests  | The signed-in account                      |
| `DELETE /auth/me`               | Tourist                | Delete the account and everything about it |
| `GET /auth/users`               | Admin                  | List accounts, such as every helper        |
| `POST /auth/users`              | Admin                  | Make a family, helper or admin account     |

## Events

Auth sends these and receives none.

| Event                 | When                             | Who listens                                     |
| --------------------- | -------------------------------- | ----------------------------------------------- |
| `auth.code_requested` | Someone asked for a sign-in code | Notification                                    |
| `user.deleted`        | A tourist deleted their account  | Every service that keeps something about people |

## Tokens

Access tokens are Ed25519 JWTs with `sub`, `role`, `email`, `name`, and `yaiId` for family accounts. Roles are `tourist`, `family`, `helper` and `admin`.

A guest token (`POST /auth/guest-sessions`, for checkout without signing in) has `role: guest` and `sid`, a new ID for each checkout. Anyone can start one for any email, so booking must only show a guest the bookings made with the same `sid`. The answer carries the name typed at checkout, never the one saved on an existing account. An email that belongs to a family, helper or admin account gets 409 `sign_in_needed`.

## How it stays safe

- Codes are hashed with HMAC-SHA256 under a key only auth has, so a copy of the database can't be used to work out a code. Each code works once, and a new request replaces the old code.
- Tries are counted before the code is compared, in one step, so many tries sent at once still stop at 5. The gateway also limits codes to 5 per email and 20 per address every 15 minutes, and sign-ins to 10 per address.
- Only hashes of refresh tokens are stored. Each refresh gives a new token. If two tabs refresh at the same moment, the second one within 10 seconds gets an access token without a new cookie. An old token that comes back after that ends the session, because it may have been copied.
- The cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, and only sent to `/api/auth/sessions`. Chrome and Firefox accept `Secure` cookies on `http://localhost`.
- Sign-in codes, tokens and cookies never appear in logs.

## Accounts

- Admins make family, helper and admin accounts with `POST /auth/users`. A family account needs `yaiId`, and only a family account may have one. An email that already has an account gets 409 `email_taken`.
- `GET /auth/users?role=helper` lists accounts, 20 a page by default. Pass `nextCursor` back as `cursor` for the next page.
- A tourist deletes their own account with `DELETE /auth/me`. Auth sends `user.deleted` first, so every service forgets that person, then deletes the account, its sessions and any code. If the event can't be sent, nothing is deleted and the answer is 503. An access token already given out still passes other services' checks until it runs out, at most 15 minutes.

The first admin is made from the command line, once per database:

```bash
npm run create-admin -w @yais-kitchen/auth -- admin@example.com "Admin name"
```

That admin signs in with a code like anyone else and makes the other staff accounts. If the email already has an account, it becomes an admin.

## What it keeps

In the `auth` database.

| Collection      | What                                          | Kept for                       |
| --------------- | --------------------------------------------- | ------------------------------ |
| `users`         | Email, name, role, and `yaiId` for families   | Until the account is deleted   |
| `sign_in_codes` | One per email: the code's hash, tries, expiry | A day after the code runs out  |
| `sessions`      | Hashes of the current and last refresh tokens | 30 days after the last refresh |

## Run it

`npm run up` starts it with everything else (see `infra/README.md`). To work on auth itself, stop its container with `docker compose -f infra/docker-compose.yml stop auth`, then:

```bash
npm run auth
```

It listens on port 3001 and reads the root `.env`. The gateway in Docker still sends auth calls to its own container, so call this one straight on port 3001, or run the gateway with `npm run gateway` and `AUTH_URL=http://127.0.0.1:3001`. Codes arrive in Mailpit at http://localhost:8025.

## Environment

| Variable           | Default  | What                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------------------- |
| `AUTH_PRIVATE_KEY` | required | Ed25519 private key in PEM. Signs tokens. The public key is worked out from it. |
| `MONGO_URL`        | required | MongoDB. The service uses the `auth` database.                                  |
| `RABBITMQ_URL`     | required | RabbitMQ, to send `auth.code_requested` and `user.deleted`                      |
| `PORT`             | `3001`   |                                                                                 |
| `LOG_LEVEL`        | `info`   |                                                                                 |

`packages/shared/README.md` says how to make the key pair. Every other service gets the matching `AUTH_PUBLIC_KEY`.

## Tests

`npm test` runs them with a MongoDB in memory and checks every answer against `openapi.yaml` and every event against `asyncapi.yaml`.
