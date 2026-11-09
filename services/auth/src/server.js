import {
  connectEvents,
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createAuthApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createCodeHasher, createTokenSigner, publicKeyOf } from "./secrets.js";
import { createStore } from "./store.js";

const config = loadConfig({
  PORT: { type: "port", default: 3001 },
  LOG_LEVEL: { default: "info" },
  MONGO_URL: { type: "url" },
  RABBITMQ_URL: { type: "url" },
  AUTH_PRIVATE_KEY: { type: "pem" },
});

const service = "auth";
const logger = createLogger({ service, level: config.LOG_LEVEL });

const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: service,
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();
const store = createStore(connection);
await store.init();

// Auth only sends events.
const events = await connectEvents({
  url: config.RABBITMQ_URL,
  service,
  logger,
});

const auth = createAuth({
  store,
  signer: await createTokenSigner(config.AUTH_PRIVATE_KEY),
  hasher: createCodeHasher(config.AUTH_PRIVATE_KEY),
  events,
  logger,
});

const app = createAuthApp({
  auth,
  verifyToken: await createTokenVerifier(publicKeyOf(config.AUTH_PRIVATE_KEY)),
  logger,
  ready: {
    database: () => connection.readyState === 1,
    events: events.isReady,
  },
});

await startService({
  app,
  port: config.PORT,
  logger,
  async onStop() {
    await events.close();
    await connection.close();
  },
});
