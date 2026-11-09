import http from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";
import { HttpError, notFound, serviceUnavailable } from "@yais-kitchen/shared";

// The first part of every path says which service owns it: /api/catalog/yais.
export const SERVICES = [
  "auth",
  "catalog",
  "booking",
  "payment",
  "live",
  "media",
];

// Headers that only describe one connection, so they never pass through.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Headers the gateway sets itself, or that only services may send each other.
// The caller's versions are dropped, so nobody can fake them.
const SET_BY_GATEWAY = new Set([
  "host",
  "content-length",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "x-request-id",
  "x-internal-token",
]);

function headersFor(req, body) {
  const listedInConnection = (req.get("connection") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase());
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name) || SET_BY_GATEWAY.has(name)) continue;
    if (listedInConnection.includes(name)) continue;
    headers[name] = value;
  }
  headers["x-request-id"] = req.id;
  headers["x-forwarded-for"] = req.ip;
  headers["x-forwarded-proto"] = req.protocol;
  headers["x-forwarded-host"] = req.get("host");
  if (body) headers["content-length"] = String(body.length);
  return headers;
}

const timedOut = () =>
  new HttpError(
    504,
    "upstream_timeout",
    "That took too long. Please try again.",
  );

/**
 * Sends each request on to the service that owns its path, without `/api`,
 * and streams the answer back unchanged. The token goes along too, because
 * every service checks it again. A service that is down answers 503, and a
 * slow one 504.
 *
 * @param {Record<string, string>} upstreams Base URL for each of SERVICES.
 * @param {{ timeoutMs: number, logger: import("pino").Logger }} options
 */
export function proxyTo(upstreams, { timeoutMs, logger }) {
  const missing = SERVICES.filter((service) => !upstreams[service]);
  if (missing.length > 0) throw new TypeError(`No URL for: ${missing}`);

  const targets = Object.fromEntries(
    SERVICES.map((service) => [service, new URL(upstreams[service])]),
  );
  const agents = {
    "http:": new http.Agent({ keepAlive: true }),
    "https:": new https.Agent({ keepAlive: true }),
  };

  return function proxy(req, res, next) {
    // Only what the spec validator matched under /api, so nothing skips the
    // checks before this.
    if (!req.openapi || !req.originalUrl.startsWith("/api/")) {
      return next(notFound());
    }
    const pathAndQuery = req.originalUrl.slice("/api".length);
    const target = targets[pathAndQuery.split(/[/?]/)[1]];
    if (!target) return next(notFound());

    // express.json() kept the exact bytes, so signatures still match.
    const body = req.rawBody;
    const upstream = (target.protocol === "https:" ? https : http).request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: target.pathname.replace(/\/$/, "") + pathAndQuery,
      headers: headersFor(req, body),
      agent: agents[target.protocol],
      signal: AbortSignal.timeout(timeoutMs),
    });

    let callerLeft = false;
    res.on("close", () => {
      if (!res.writableFinished) {
        callerLeft = true;
        upstream.destroy();
      }
    });

    upstream.on("response", (answer) => {
      res.status(answer.statusCode);
      for (const [name, value] of Object.entries(answer.headers)) {
        if (HOP_BY_HOP.has(name)) continue;
        // CORS belongs to the gateway alone. The mock server, for one, allows
        // every origin, which would let any site read a signed-in answer.
        if (name.startsWith("access-control-")) continue;
        // Keep the gateway's `Vary: Origin` next to the service's own.
        if (name === "vary") res.vary(value);
        else res.setHeader(name, value);
      }
      pipeline(answer, res, (error) => {
        if (error && !callerLeft) {
          logger.warn({ err: error }, "the answer from a service broke off");
        }
      });
    });

    upstream.on("error", (error) => {
      if (callerLeft) return;
      if (res.headersSent) return res.destroy(error);
      const failure =
        error.name === "TimeoutError" || error.cause?.name === "TimeoutError"
          ? timedOut()
          : serviceUnavailable();
      failure.cause = error;
      next(failure);
    });

    upstream.end(body);
  };
}
