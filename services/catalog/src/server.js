import {
  connectEvents,
  createDurable,
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createCatalogApp } from "./app.js";
import { createStore } from "./store.js";

const config = loadConfig({
  PORT: { type: "port", default: 3002 },
  LOG_LEVEL: { default: "info" },
  MONGO_URL: { type: "url" },
  RABBITMQ_URL: { type: "url" },
  AUTH_PUBLIC_KEY: { type: "pem" },
  INTERNAL_TOKEN: {},
  // Where media serves ready photos and videos.
  MEDIA_PUBLIC_URL: { type: "url" },
});

const service = "catalog";
const logger = createLogger({ service, level: config.LOG_LEVEL });

const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: service,
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();
const store = createStore(connection);
await store.init();

// Catalog only sends events.
const events = await connectEvents({
  url: config.RABBITMQ_URL,
  service,
  logger,
});

// Audit entries wait in the outbox until RabbitMQ has them, so none is lost
// while the broker is down.
const durable = createDurable(connection);
let flushing;
const flush = () => {
  flushing ??= durable
    .flush(events)
    .catch((error) =>
      logger.warn({ err: error }, "could not send the outbox; trying again"),
    )
    .finally(() => {
      flushing = undefined;
    });
};
const flushTimer = setInterval(flush, 1000);
flushTimer.unref();

const app = createCatalogApp({
  store,
  events,
  mediaPublicUrl: config.MEDIA_PUBLIC_URL,
  verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
  internalToken: config.INTERNAL_TOKEN,
  logger,
  audit: (entry) => durable.enqueue(undefined, "audit.recorded", entry),
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
    clearInterval(flushTimer);
    await flushing;
    await events.close();
    await connection.close();
  },
});
