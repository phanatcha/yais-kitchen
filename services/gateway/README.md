# Gateway

The one address the web app calls. It checks every request against the spec, then forwards it to the service that owns the path.

## What it does

1. Answers CORS for the web app at `WEB_ORIGIN` only. CORS headers from services, such as the mock server's allow-all ones, are dropped.
2. Checks the path, method, fields and query against `openapi.yaml`. Anything else gets 400, 404 or 405.
3. Checks the token and role from `x-roles`. No token or an expired one gets 401, the wrong role 403.
4. Applies each `x-rate-limit` rule of the operation, by email, address or user. Over any limit gets 429 with `Retry-After`.
5. Forwards the request without `/api`, with the token, the request ID and the caller's address. `/api/catalog/yais` goes to the catalog service as `/catalog/yais`.
6. Streams the answer back unchanged. A service that is down gets 503, and one slower than `UPSTREAM_TIMEOUT_MS` gets 504.

`/internal` paths are never forwarded. Webhook bodies are forwarded byte for byte, so signatures still match. The services check the token again, so a request that somehow skips the gateway is still refused.

## Run it

`npm run up` starts it with everything else (see `infra/README.md`). There it sends auth and catalog paths to their containers, and the rest to the mock server.

To work on the gateway itself, stop its container with `docker compose -f infra/docker-compose.yml stop gateway`, then:

```bash
npm run gateway
```

It listens on http://localhost:8080 and reads the root `.env`. Services without a URL there go to the mock server at `MOCK_URL`, which the stack also runs.

## Environment

| Variable                                                                               | Default                 | What                                                           |
| -------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `AUTH_PUBLIC_KEY`                                                                      | required                | Auth's Ed25519 public key, to check tokens                     |
| `WEB_ORIGIN`                                                                           | required                | The web app, such as `http://localhost:5173`                   |
| `PORT`                                                                                 | `8080`                  |                                                                |
| `MOCK_URL`                                                                             | `http://127.0.0.1:4010` | Where paths go for services without a URL                      |
| `AUTH_URL`, `CATALOG_URL`, `BOOKING_URL`, `PAYMENT_URL`, `LIVE_CLASS_URL`, `MEDIA_URL` | not set                 | Each service's address, once it exists                         |
| `UPSTREAM_TIMEOUT_MS`                                                                  | `10000`                 | How long a service gets to answer                              |
| `TRUST_PROXY_HOPS`                                                                     | `0`                     | Proxies in front of the gateway, so limits see the real caller |
| `LOG_LEVEL`                                                                            | `info`                  |                                                                |

## Tokens for trying things out

With `AUTH_URL` set and auth running, sign in the real way: ask for a code, read it in Mailpit, and send it to `/api/auth/sessions`. To skip that, sign a token for any role with your local private key (`AUTH_PRIVATE_KEY` in `.env`, made by `npm run setup`):

```bash
npm run token -w @yais-kitchen/gateway -- tourist
```

Send it as `Authorization: Bearer <token>`. It lasts 8 hours. For `family`, add the Yai's ID after the role.

## Limits worth knowing

- Rate limits are counted in memory, which is right for one gateway. Running more than one would need a shared store.
- Behind another proxy, set `TRUST_PROXY_HOPS`, or every caller looks like that proxy and shares one limit.
