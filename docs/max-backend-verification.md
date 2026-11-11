# Backend verification — 11 November 2026

Actual local results on Node v22.18.0 / Windows:

| Command                                                                                               | Result                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npx vitest run`                                                                                      | 608 passed, 10 skipped; 22 suites passed, 3 infrastructure suites skipped |
| `npm run test:max -- --coverage`                                                                      | 87 passed across 6 suites; no failures or skips                           |
| `npm run lint`                                                                                        | ESLint, Prettier and Redocly OpenAPI/AsyncAPI validation passed           |
| `npm run validate:api`                                                                                | Both centralized specifications passed Redocly                            |
| `node --check` on all three services' source files                                                    | Passed                                                                    |
| `docker compose -f infra/docker-compose.yml -f infra/max.compose.yml config --no-interpolate --quiet` | Passed configuration validation                                           |
| `git diff --check`                                                                                    | Passed; Git only warned about checkout line-ending conversion             |

The focused backend coverage run reported 66.85% line coverage across all imported
files, including shared and gateway code. Business-service line coverage was
89.16% booking, 83.33% payment and 85.63% live. This is not a claim of full provider
or startup coverage. The HTML coverage report is generated under ignored
`coverage/`.

MongoDB tests ran actual local replica sets using memory-server and the cached
MongoDB executable. The concurrency test did not mock atomic database operations.
Tests injected clocks and provider adapters; Stripe and LiveKit signature/token
tests additionally exercised the official SDKs without provider network calls.

The ten skipped tests belong to existing infrastructure suites requiring running
RabbitMQ, Mailpit or the deployed gateway. Docker's daemon was unavailable, so
container startup and real broker/provider acceptance were not executed. No Stripe
or LiveKit credentials were supplied, and no charges were made. Media is absent;
private Egress output and physical 90-day deletion require its implementation.
Automatic STT is not configured; manual caption transport is implemented.

See [handover](max-backend.md) for exact setup, external dependencies, API routes,
permissions, database indexes, events and frontend instructions.
