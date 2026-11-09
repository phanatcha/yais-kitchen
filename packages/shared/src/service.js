import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import helmet from "helmet";
import { authorizeFromSpec } from "./auth.js";
import { errorHandler, notFound } from "./errors.js";
import { logContext } from "./logger.js";
import { loadApiSpec, specValidator } from "./spec.js";

// The gateway sends its own request ID. Anything else gets a new one.
const VALID_REQUEST_ID = /^[\w-]{8,64}$/;

function requestId(req, res, next) {
  const given = req.get("x-request-id");
  req.id =
    given && VALID_REQUEST_ID.test(given) ? given : `req_${randomUUID()}`;
  res.set("X-Request-Id", req.id);
  logContext.run({ requestId: req.id }, next);
}

function logRequests(logger) {
  return function logRequest(req, res, next) {
    const started = performance.now();
    res.on("finish", () => {
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Math.round(performance.now() - started),
          userId: req.user?.id,
          errorCode: res.locals.errorCode,
        },
        "request finished",
      );
    });
    next();
  };
}

async function runCheck(check, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    const result = await Promise.race([Promise.resolve().then(check), timeout]);
    return result === false ? "failed" : "ok";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

function readiness(checks, timeoutMs) {
  return async function ready(req, res) {
    if (req.app.locals.stopping) {
      return res.status(503).json({ status: "stopping", checks: {} });
    }
    const results = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => [
        name,
        await runCheck(check, timeoutMs),
      ]),
    );
    const ok = results.every(([, result]) => result === "ok");
    res.status(ok ? 200 : 503).json({
      status: ok ? "ready" : "not_ready",
      checks: Object.fromEntries(results),
    });
  };
}

// Raw bytes for webhooks, which check a signature over the exact body.
function keepRawBody(req, res, body) {
  req.rawBody = body;
}

/**
 * Builds the Express app every service starts from. In order: security
 * headers, a request ID, `/health` and `/ready`, one log line per request,
 * any `before` middleware, JSON bodies up to `bodyLimit`, the spec validator,
 * the spec's token and role rules, the service's own routes, and errors in
 * the spec's format.
 *
 * @param {object} options
 * @param {string} options.service Name used in logs and `/health`.
 * @param {import("pino").Logger} options.logger
 * @param {import("express").RequestHandler | import("express").RequestHandler[]} [options.routes] Usually an express.Router().
 * @param {{ verifyToken?: Function, internalToken?: string }} [options.auth]
 * @param {Record<string, () => unknown>} [options.ready] Checks for `/ready`. Each may return false or throw to fail.
 * @param {object} [options.spec] From loadApiSpec(). Pass false to turn the validator off.
 * @param {boolean} [options.validateResponses] Turn on in tests.
 * @param {string} [options.bodyLimit]
 * @param {import("express").RequestHandler[]} [options.before] Runs before the body is read and checked, such as CORS.
 * @param {boolean | number | string} [options.trustProxy] Express's "trust proxy", so `req.ip` is the caller's address behind a proxy.
 */
export function createApp({
  service,
  logger,
  routes,
  auth = {},
  ready = {},
  spec = loadApiSpec(),
  validateResponses = false,
  bodyLimit = "100kb",
  readyTimeoutMs = 2000,
  before = [],
  trustProxy = false,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.locals.stopping = false;

  app.use(helmet());
  app.use(requestId);

  // Not in the spec, and the gateway never forwards them. Not logged either,
  // because Docker calls them every few seconds.
  app.get("/health", (req, res) => res.json({ status: "ok", service }));
  app.get("/ready", readiness(ready, readyTimeoutMs));

  app.use(logRequests(logger));
  for (const middleware of before) app.use(middleware);
  app.use(
    express.json({
      limit: bodyLimit,
      type: ["application/json", "application/*+json"],
      verify: keepRawBody,
    }),
  );
  if (spec) {
    app.use(specValidator(spec, { validateResponses }));
    app.use(authorizeFromSpec(auth));
  }
  if (routes) app.use(routes);

  app.use((req, res, next) => next(notFound()));
  app.use(errorHandler(logger));
  return app;
}

/**
 * Starts the app and stops it cleanly on SIGTERM or SIGINT: `/ready` turns
 * 503, open requests finish, then `onStop` closes databases and the event
 * broker.
 *
 * @param {object} options
 * @param {import("express").Express} options.app
 * @param {number} options.port 0 picks a free port.
 * @param {import("pino").Logger} options.logger
 * @param {() => Promise<void>} [options.onStop]
 * @param {number} [options.stopTimeoutMs] Open requests get this long to finish.
 * @param {boolean} [options.handleSignals] Off in tests.
 */
export async function startService({
  app,
  port,
  logger,
  onStop = async () => {},
  stopTimeoutMs = 10_000,
  handleSignals = true,
}) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const listeningOn = server.address().port;
  logger.info({ port: listeningOn }, "service started");

  let stopping;
  function stop(reason = "asked to stop") {
    stopping ??= (async () => {
      app.locals.stopping = true;
      logger.info({ reason }, "service stopping");

      const closed = new Promise((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      let timer;
      const timedOut = new Promise((resolve) => {
        timer = setTimeout(resolve, stopTimeoutMs);
      });
      await Promise.race([closed, timedOut]);
      clearTimeout(timer);
      server.closeAllConnections();

      await onStop();
      logger.info("service stopped");
    })();
    return stopping;
  }

  if (handleSignals) {
    for (const signal of ["SIGTERM", "SIGINT"]) {
      process.once(signal, () => {
        stop(signal).then(
          () => process.exit(0),
          (error) => {
            logger.error({ err: error }, "service did not stop cleanly");
            process.exit(1);
          },
        );
      });
    }
  }

  return { server, port: listeningOn, stop };
}
