import {
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";
import { createGatewayApp, resolveUpstreams, SERVICE_URL_VARS } from "./app.js";

const serviceUrls = Object.fromEntries(
  Object.values(SERVICE_URL_VARS).map((name) => [
    name,
    { type: "url", optional: true },
  ]),
);

const config = loadConfig({
  PORT: { type: "port", default: 8080 },
  LOG_LEVEL: { default: "info" },
  AUTH_PUBLIC_KEY: { type: "pem" },
  WEB_ORIGIN: { type: "url" },
  MOCK_URL: { type: "url", default: "http://127.0.0.1:4010" },
  ...serviceUrls,
  UPSTREAM_TIMEOUT_MS: { type: "integer", default: 10_000 },
  TRUST_PROXY_HOPS: { type: "integer", default: 0 },
});

const logger = createLogger({ service: "gateway", level: config.LOG_LEVEL });
const upstreams = resolveUpstreams(config);
logger.info({ upstreams }, "forwarding to these addresses");

const app = createGatewayApp({
  logger,
  verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
  upstreams,
  webOrigin: config.WEB_ORIGIN,
  timeoutMs: config.UPSTREAM_TIMEOUT_MS,
  trustProxy: config.TRUST_PROXY_HOPS,
});

await startService({ app, port: config.PORT, logger });
