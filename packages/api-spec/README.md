# API spec

The contract between the web app and the services. When the API changes, change these files first, then the code.

- `openapi.yaml` (OpenAPI 3.1): every HTTP endpoint, behind the gateway at `/api`.
- `asyncapi.yaml` (AsyncAPI 3.0): every event the services send each other through RabbitMQ.

## Commands

Run these from the repo root.

| Command        | What it does                                                          |
| -------------- | --------------------------------------------------------------------- |
| `npm run mock` | Starts a mock API on http://127.0.0.1:4010 that answers from the spec |
| `npm run lint` | Also checks both specs with Redocly                                   |
| `npm test`     | Also checks the rules below                                           |

`npm run docs -w @yais-kitchen/api-spec` builds a readable HTML page of the API into `dist/`.

The mock lets the web app be built before the services exist. Add `Prefer: code=409` to a request to get that error back, or `Prefer: dynamic=true` for random data.

## Rules

- Paths start with the service that owns them: `/auth`, `/catalog`, `/booking`, `/payment`, `/live`, `/media`.
- Paths under `/internal` are for calls between services, use `X-Internal-Token`, and are never routed by the gateway.
- `x-roles` lists who may call an operation: `guest`, `tourist`, `family`, `helper` or `admin`. An empty list means anyone, and then the operation must not require a token.
- `x-requirements` lists the requirements an operation or event serves (`FR-01` to `FR-39`, or `privacy`). The tests fail if a requirement that needs the API is not covered.
- Money is an integer number of satang with `currency: THB`. Times are UTC.
- Lists take `limit` (up to 50) and `cursor`, and return `items` and `nextCursor`.
- Errors always look like `{ "error": { "code", "message", "requestId", "retryable" } }`.
- Writes that take money or seats accept an `Idempotency-Key` header.
- Changes are additive. Removing or renaming a field needs a new path or a new event version.
- Example data uses made-up sample Yais only.
