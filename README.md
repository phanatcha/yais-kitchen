# Yai's Kitchen

Live online cooking classes with Thai grandmothers (Yais). A JavaScript MERN website built as microservices.

## Getting started

You need Node 22 (see `.nvmrc`) and Docker.

```bash
npm install
npm run lint
npm test
```

`npm install` also turns on the git hook that lints every commit. `npm run format` fixes formatting.

## Layout

| Folder                  | What                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `apps/web`              | React web app                                              |
| `services/gateway`      | Routing, token checks, rate limits                         |
| `services/auth`         | Users, roles, email sign-in codes, tokens                  |
| `services/catalog`      | Yais, classes, recipes, class times, applications, FAQ     |
| `services/notification` | Every email                                                |
| `services/booking`      | Seat holds, bookings, ratings, earnings                    |
| `services/payment`      | Stripe payments, webhooks, refunds                         |
| `services/live-class`   | LiveKit rooms, recordings, recipe steps, captions          |
| `services/media`        | Uploads, resizing, signed links, recording storage         |
| `packages/api-spec`     | OpenAPI and AsyncAPI spec, the source of truth for the API |
| `packages/shared`       | Code every service uses                                    |
| `infra`                 | Docker Compose, seed data, backups                         |

## How we work

- One branch and pull request per piece of work, named like `api-spec` or `auth-sign-in`.
- Every pull request needs one review and passing CI. Nobody pushes straight to `main`.
- When the API changes, the spec changes first and the code follows.
- Commit messages are short notes, like `add sign-in code email, fix token expiry`.
