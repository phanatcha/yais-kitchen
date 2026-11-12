# Max backend implementation plan

Repository inspected: auth, catalog, gateway, notification, shared utilities,
central OpenAPI/AsyncAPI contracts, Compose, CI and tests. No website specification
or media implementation is present. Working tree was clean before changes.

1. Extend the central contracts additively; retain `/booking`, `/payment`, `/live`
   and internal-token authentication. Public holds remain bearer capabilities.
2. Implement MongoDB transactions, per-session allocation locks, persistent inbox
   and outbox. Expiry is evaluated during allocation, independently of cleanup.
3. Implement booking ownership (including guest checkout `sid`), cancellation,
   checklist, ratings and integer earnings/manual payout accounting.
4. Implement official Stripe SDK test-mode payment intents, raw signed webhooks,
   monotonic payment state and recoverable full refunds.
5. Implement official LiveKit SDK access, persistent steps and explicit consent
   per participant connection. Media owns storage; manual captions are supported.
6. Run API/database/contract tests, wire local services, document provider setup.

Policies: expired paid holds are never reclaimed; emit the existing
`booking.cancelled` contract with `paid_after_expiry` for a full refund. Yai share
is floor(revenue * 75 / 100), platform receives the remainder. MongoDB must use a
replica set. Disconnect/reconnect invalidates recording consent. Existing event
names and the centralized specifications remain authoritative.
