import { createApp, loadApiSpec } from "@yais-kitchen/shared";
import { allowWebApp } from "./cors.js";
import { proxyTo, SERVICES } from "./proxy.js";
import { createRateLimiter, limitFromSpec } from "./rate-limit.js";

// The environment variable that holds each service's address.
export const SERVICE_URL_VARS = {
  auth: "AUTH_URL",
  catalog: "CATALOG_URL",
  booking: "BOOKING_URL",
  payment: "PAYMENT_URL",
  live: "LIVE_CLASS_URL",
  media: "MEDIA_URL",
};

/**
 * A service that isn't built yet has no URL, so its paths go to the mock
 * server. The web app can use the gateway from day one.
 */
export function resolveUpstreams(config) {
  return Object.fromEntries(
    SERVICES.map((service) => [
      service,
      config[SERVICE_URL_VARS[service]] ?? config.MOCK_URL,
    ]),
  );
}

/**
 * The spec as the gateway sees it: every path under `/api`, and no
 * `/internal` paths, so those answer 404 and are never forwarded.
 */
export function gatewaySpec() {
  const spec = loadApiSpec();
  spec.servers = [{ url: "/api" }];
  for (const path of Object.keys(spec.paths)) {
    if (path.startsWith("/internal/")) delete spec.paths[path];
  }
  return spec;
}

/**
 * The gateway checks each request against the spec (path, method, fields,
 * token and role, rate limit) and only then forwards it. Bad requests stop
 * here and never reach a service.
 *
 * @param {object} options
 * @param {import("pino").Logger} options.logger
 * @param {(token: string) => Promise<object>} options.verifyToken
 * @param {Record<string, string>} options.upstreams From resolveUpstreams().
 * @param {string} options.webOrigin The web app, the only site allowed to call from a browser.
 * @param {number} [options.timeoutMs] How long a service gets to answer.
 * @param {boolean | number} [options.trustProxy] Hops of proxies in front of the gateway, so rate limits see the caller's address.
 * @param {ReturnType<typeof createRateLimiter>} [options.limiter]
 */
export function createGatewayApp({
  logger,
  verifyToken,
  upstreams,
  webOrigin,
  timeoutMs = 10_000,
  trustProxy = false,
  limiter = createRateLimiter(),
}) {
  return createApp({
    service: "gateway",
    logger,
    spec: gatewaySpec(),
    auth: { verifyToken },
    before: [allowWebApp(webOrigin)],
    routes: [limitFromSpec(limiter), proxyTo(upstreams, { timeoutMs, logger })],
    trustProxy,
  });
}
