# Max backend handover

## Scope and source of truth

The implemented workspaces are `@yais-kitchen/booking`, `@yais-kitchen/payment`
and `@yais-kitchen/live-class`. Each has an Express app factory, startup entry,
Mongoose store, separate business service, provider boundaries, API tests and an
environment example. The existing shared factory supplies helmet, JSON pino
request logs, request IDs, jose verification, OpenAPI validation, health/readiness
and graceful HTTP shutdown. No frontend files changed.

Contracts remain in `packages/api-spec/openapi.yaml` (OpenAPI 3.1) and
`packages/api-spec/asyncapi.yaml` (AsyncAPI 3.0). There are no duplicate specs.
All browser routes below have the `/api` gateway prefix. Services independently
enforce the signed token and contract roles. `/internal` requires `INTERNAL_TOKEN`
and is excluded from gateway routing. The repository uses `AUTH_PUBLIC_KEY`, not
JWKS; it verifies EdDSA signature, issuer, audience and expiry with jose.

## Local setup

Use the Node version in `.nvmrc` and `npm ci`. `npm run setup` creates the root
`.env` with auth keys and an internal token. Never commit credentials. The base
`npm run up` retains mock-backed routes for provider-dependent services.

MongoDB now starts as a single-member `rs0` replica set, initialized by its Compose
health check. Transactions are mandatory: standalone MongoDB is not supported by
the three new services. Inside Docker the host is `mongo:27017`. From the host use
`mongodb://localhost:27017/?replicaSet=rs0&directConnection=true`. Existing data
volumes are preserved. The existing services keep their own database names.

To run all real services, fill in Stripe test and LiveKit credentials in `.env`,
then run `npm run up:max`. This merges `infra/max.compose.yml` into the base stack
and sets the gateway's `BOOKING_URL`, `PAYMENT_URL` and `LIVE_CLASS_URL`.
Containers expose no additional browser ports. No real media adapter is faked.

For host development, set `CATALOG_URL=http://127.0.0.1:3002` and
`BOOKING_URL=http://127.0.0.1:3003`, then run `npm run booking`, `npm run payment`
and `npm run live-class` in separate terminals. Set `PORT` per process if needed;
defaults are 3003, 3004 and 3005. Set gateway upstreams to these host URLs too.

Common required variables: `MONGO_URL`, `RABBITMQ_URL`, `AUTH_PUBLIC_KEY`,
`INTERNAL_TOKEN`; optional `PORT` and `LOG_LEVEL`. Booking needs `CATALOG_URL`.
Payment needs `BOOKING_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
optional `STRIPE_PROMPTPAY_ENABLED=false`. Live needs `CATALOG_URL`, `BOOKING_URL`,
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and optional `MEDIA_URL`.
Read each service's `.env.example` for the exact names.

## Booking

| Route                                  | Permission / behavior                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /booking/class-times?classId=...` | Public; catalog sessions plus seats left, UTC and Thailand display time            |
| `POST /booking/holds`                  | Public capability checkout; `{classTimeId, guests}`, required `Idempotency-Key`    |
| `DELETE /booking/holds/{holdId}`       | Public secret capability; releases an unconverted hold                             |
| `POST /booking/bookings`               | Guest or tourist; `{holdId}`, `Idempotency-Key`; verified identity owns booking    |
| `GET /booking/bookings`                | Tourist's My Classes, family's Yai or admin; `when`, `status`, session/Yai filters |
| `GET /booking/bookings/{id}`           | Owner, matching guest checkout `sid`, associated family or admin                   |
| `POST /booking/bookings/{id}/cancel`   | Tourist owner until 48h before start; admin override                               |
| `PUT /booking/bookings/{id}/checklist` | Tourist owner; `{checkedIngredientIds:[...]}`                                      |
| `POST /booking/bookings/{id}/rating`   | Tourist owner of completed booking; one rating                                     |
| `GET /booking/ratings`                 | Admin                                                                              |
| `GET /booking/earnings?yaiId=...`      | Associated family or admin; `groupBy=class                                         | month`, date bounds |
| `GET /booking/payouts`                 | Associated family or admin                                                         |
| `POST /booking/payouts`                | Admin; `{yaiId,periodStart,periodEnd}` creates a manual payout batch               |
| `POST /booking/payouts/{id}/mark-paid` | Admin; `{reference}` records a manual PromptPay transfer                           |

Lists use `limit` (maximum 50), `cursor`, and return `items,nextCursor`.
Never send arbitrary user IDs, prices or statuses from the browser. Public hold
IDs have 192 bits of entropy and are secrets, matching France's original contract.
Public holds are rate-limited. Booking conversion binds a hold exactly once;
replaying it as another identity is forbidden. The hold itself is the conversion
idempotency scope. Reusing a hold idempotency key with different seats is rejected.

Allocation writes lock one MongoDB document per catalog session inside a
transaction. Availability counts unexpired holds and confirmed allocations.
Confirmed holds have a null expiry; released ones never count. Expiry filtering
is immediate, independent of the background cleanup worker. Capacity is capped at
six and must also fit catalog capacity. Draft, cancelled, past, helperless and
sample-only classes are rejected. Catalog remains authoritative; only HTTP calls
are used. There is no catalog database access or copied scheduling model.

Lifecycle: `pending_payment → confirmed → completed`. Unpaid bookings can become
`expired`; cancellation yields `cancelled`, with separate `refundStatus` pending,
failed or succeeded. Confirmed full refunds yield additive status `refunded`.
Payment failure leaves seats held until expiry so the tourist can retry. A browser
redirect cannot confirm a booking. A successful payment arriving after expiry
always causes `booking.cancelled` with `paid_after_expiry`: money returns and
capacity is never reclaimed. Cancellation writes, seat release and its refund
event commit together. Retries use the durable outbox and payment refund record.

Yai earnings are integer satang: `floor(total * 3 / 4)`, with the remainder kept by
the platform. Only completed bookings earn revenue; refunded bookings do not.
Payout creation atomically assigns each booking to one batch, preventing overlap.
Payouts are manual accounting records; this service does not transfer money.
Cancelling a batched booking records a negative refund adjustment. Due batch
amounts are reduced; already-paid batches retain their historical transfer amount
and flag the adjustment `recoveryRequired` for manual reconciliation.

## Stripe payments

| Route                                | Permission / behavior                                            |
| ------------------------------------ | ---------------------------------------------------------------- |
| `GET /payment/methods`               | Guest, tourist or admin; account-supported methods               |
| `POST /payment/intents`              | Guest or tourist owner; `{bookingId,method}`, idempotency header |
| `GET /payment/payments/{id}`         | Owner with matching guest scope, or admin                        |
| `GET /payment/payments`              | Admin, paginated status and booking filters                      |
| `GET /payment/refunds`               | Admin, paginated refund audit history                            |
| `POST /payment/webhooks/stripe`      | Public transport; mandatory verified `Stripe-Signature`          |
| `POST /internal/payment/refunds`     | Trusted service command only; full refund for `bookingId`        |
| `GET /internal/payment/refunds/{id}` | Trusted refund audit/status                                      |

Only `sk_test_` keys are accepted. Intents and webhook objects must be test mode.
The amount comes from the protected booking endpoint and must be safe integer
satang in THB. A unique booking index and stable Stripe idempotency key prevent
duplicate charges. Card numbers and CVC never reach these APIs. Client secrets
are returned only from intent creation; do not put them in logs or URLs.

Enable card payments in a Stripe sandbox/test account. PromptPay is opt-in;
`STRIPE_PROMPTPAY_ENABLED=true` additionally checks the account's active
`promptpay_payments` capability. A missing capability means unavailable, never
simulated success. The provider's final API validation remains authoritative.
Use Stripe Elements to confirm the returned client secret. Poll payment and
booking status; do not treat the return URL as proof of payment.

Run `stripe listen --forward-to localhost:8080/api/payment/webhooks/stripe` and put
its `whsec_...` signing secret in `.env`. For host-only payment development, forward
to `localhost:3004/payment/webhooks/stripe`. Use the application's actual intent
with a Stripe test payment method; a generic `stripe trigger` intent has no local
payment record and is deliberately not accepted as an application payment.

The gateway forwards the exact raw bytes. The official SDK checks signatures.
Webhook IDs, status and retry count are persisted; failed processing is not
acknowledged. Payment writes and events are transactional. Late failure events
cannot regress a successful/refunded payment. Refunds have a unique payment
reference, stable Stripe key and status history. Pending refunds wait for signed
refund callbacks. Failed refunds remain auditable for operator intervention.

Provider references: [Stripe signatures](https://docs.stripe.com/webhooks/signatures),
[PaymentIntents](https://docs.stripe.com/payments/payment-intents),
[PromptPay](https://docs.stripe.com/payments/promptpay).

## LiveKit and media

All routes begin `/live/class-times/{classTimeId}`:

| Route             | Permission / behavior                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `POST /join`      | Confirmed tourist, assigned helper, associated family or admin; opens 10 minutes before start |
| `GET /state`      | Same participants; persisted zero-based step, version, recording notice and caption replay    |
| `PUT /step`       | Assigned helper/admin; `{index,version?}` rejects stale versions and invalid recipe steps     |
| `POST /consent`   | Connected authorized participant; `{agree:true                                                | false}`  |
| `POST /recording` | Assigned helper/admin; `{action:"start"                                                       | "stop"}` |
| `GET /recording`  | Corresponding tourist, associated family or admin; private one-hour link                      |
| `POST /captions`  | Assigned helper/admin; manual Thai or English segment                                         |
| `POST /end`       | Assigned helper/admin; stops recording, deletes room, publishes completion                    |

`POST /live/webhooks/livekit` accepts LiveKit's signed
`application/webhook+json` payloads. Configure this URL in LiveKit Cloud. The
official server SDK verifies authorization and body digest. Rooms use deterministic
`class-{classTimeId}` names. Tokens last two minutes, permit only that room and
disable client data publishing so tourists cannot spoof authoritative steps.
Family uses its account on behalf of the Yai; no Yai account is required.

Consent defaults to absent and records participant identity, LiveKit SID,
explicit decision, notice version and timestamp. All current non-egress
participants must consent. Reconnecting with a new SID requires fresh consent.
Joins stop an active recording before issuing a token; provider joins/departures,
state refreshes and a recovery worker reconcile actual participants. Withdrawal
stops recording before storing the withdrawal. Failed stop calls fail the request
so the user is not falsely told recording stopped. The provider and webhook
infrastructure must be reachable for this coordination to operate.
Recording also waits 125 seconds after the most recent join-ticket issuance.
This covers the two-minute token lifetime plus clock tolerance: an outstanding
ticket cannot admit a fresh unconsenting connection after the start-time consent
snapshot. The start endpoint returns `409 join_tickets_active` during this window.

Set `MEDIA_URL` only when media implements both contracts:

- `POST /internal/media/recording-output` with `{room}` returns a private
  LiveKit `EncodedFileOutput` configuration `{filepath,s3}`. `filepath` must start
  `recordings/`; credentials never go to clients. Media provisions private storage
  and the retention lifecycle.
- Existing `POST /internal/media/signed-links` with
  `{objectKey,expiresInSeconds:3600}` returns the contract's `SignedLink`.

Signed Egress completion persists the object key and emits existing
`recording.ready` with `deleteAfter` 90 days after scheduled end. Live refuses
links past deletion time; **physical deletion belongs to media/storage lifecycle**.
Media is currently absent: recording start and access return 503 without it.
Tests supply adapters; no permanent public URLs or duplicate media store exist.

LiveKit React handles video, audio, camera/mic, leaving and reconnecting. Boom
should enable adaptive stream/dynacast and reduce video subscription quality
under network pressure while retaining audio. The backend does not transcode
participants' live video. See [LiveKit webhooks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)
and [Egress](https://docs.livekit.io/reference/other/egress/api/).

Manual caption input works with `{segmentId,language:"th"|"en",text,final}`.
The server adds authorized producer identity and timestamp. Partial segments can
be replaced; final segments are immutable. The last 100 segments persist for
reconnect replay. Reliable LiveKit data carries step and caption messages; clients
discard stale step versions and deduplicate caption segment IDs. The
`ManualCaptionAdapter` explicitly reports no automatic STT; the test adapter yields
deterministic segments. No speech recognition or translation provider is
configured. Automated STT needs a real authorized producer adapter and credentials.

## Persistence and delivery

Booking collections: allocations, holds, bookings, ratings, payouts. Unique
indexes cover hold keys, booking hold IDs, rating booking IDs and payout periods.
Booking indexes cover owner/time and session/status. Payment collections:
payments (unique booking and sparse unique Stripe intent), refunds (unique
payment and sparse unique Stripe refund), webhookevents (unique provider event).
Live stores one livesessions document per class time, authoritative step/version,
connection consent audit, Egress metadata and bounded caption replay.

Every new service has its **own** outbox and inbox collections. Their `_id`
indexes provide durable deduplication. Outbox rows commit with business writes,
then publish with stable event IDs and timestamps; deletion occurs only after
publisher confirmation. An ambiguous publish may be repeated; inbox consumers
deduplicate. The shared RabbitMQ utility uses a durable topic exchange, persistent
messages, confirm channels, retry queues (5 attempts with increasing delay) and
`yais.events.dead`. Consumers acknowledge only after successful processing.

| Service | Publishes                                                                          | Consumes                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Booking | `booking.confirmed`, `booking.cancelled`                                           | `payment.succeeded`, `payment.failed`, `payment.refunded`, `payment.refund.failed`, `class_time.cancelled`, `live_class.ended` |
| Payment | `payment.succeeded`, `payment.failed`, `payment.refunded`, `payment.refund.failed` | `booking.cancelled`                                                                                                            |
| Live    | `live_class.ended`, `recording.ready`, `live_class.state.changed`                  | `live_class.state.changed` for reliable room broadcast                                                                         |

Notification's existing confirmation, cancellation and refund contracts are
unchanged. The existing `recording.ready` name is preserved. Payment transitions
are monotonic for terminal states. Seat transitions serialize by session.
Live step updates include a monotonic version. RabbitMQ delivery may reorder
duplicates, so clients recover state from HTTP rather than trusting arrival order.

## Boom's page integration

Book: load availability, create a hold with a fresh UUID key, display its expiry,
obtain an auth/guest token, create booking from hold, fetch supported payment
methods, create intent and confirm through Stripe Elements. Poll booking status.

My Classes: list owner bookings with `when=upcoming|past` or `status=cancelled`;
follow `nextCursor`. Cancel through the booking endpoint and display refund
progress separately from cancellation.

Get Ready: read booking for timing, ingredients and saved checks; load the recipe
from catalog for Yai tips and preparation content. Save checklist via PUT. Use
`joinOpensAt` for countdown and request a join ticket when permitted.

Live Class: connect LiveKit React with `serverUrl,token`, display the recording
notice to every participant, submit consent after connecting, and refresh `/state`
after reconnecting. Helper sends recipe indices, provides captions and ends class.
Use LiveKit's reliable data callback for `recipe.step` and `caption` messages.

After Class: read completed booking and catalog recipe, request private recording
access when available, then submit one rating. Family earnings and admin payout
pages read the booking-owned accounting endpoints.

## Verification and change control

Commands from root:

```sh
npm run test:max
npm test
npm run lint
npm run validate:api
npm run coverage -w @yais-kitchen/booking
npm run coverage -w @yais-kitchen/payment
npm run coverage -w @yais-kitchen/live-class
```

Tests use actual MongoDB replica-set transactions with memory-server, injected
clocks, Supertest, throwaway auth keys and external provider adapters. Stripe
signature tests use the official SDK. No provider credentials or charges are
required. The initial MongoDB test binary download needs network/cache access.
Infrastructure tests require their documented RabbitMQ/Mailpit/gateway env vars.

Max maintains the centralized specs after France's handover. Changes remain
additive: update contracts, tests and implementation together, validate with
Redocly, and notify France/Boom of new paths or enum members. Existing booking
states remain supported; frontend must tolerate additive `refunded`. New paths
use existing gateway service prefixes and need no routing-code rewrite.

External acceptance still requires a running Docker daemon, Stripe sandbox and
PromptPay capability if desired, LiveKit Cloud with signed webhooks, and media's
private storage/90-day deletion implementation. Automated STT is not implemented.
Live provider end-to-end tests and Docker startup must be run in that environment;
mock-backed API tests do not establish provider operational readiness.
