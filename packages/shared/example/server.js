import {
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "../src/index.js";
import { createExampleApp } from "./app.js";

// Stops here, before anything starts, if a variable is missing.
const config = loadConfig({
  PORT: { type: "port", default: 3099 },
  LOG_LEVEL: { default: "info" },
  AUTH_PUBLIC_KEY: { type: "pem" },
});

const logger = createLogger({ service: "example", level: config.LOG_LEVEL });
const app = createExampleApp({
  logger,
  verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
});

await startService({ app, port: config.PORT, logger });
