import {
  connectEvents,
  createApp,
  createLogger,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createCatalogClient } from "./catalog.js";
import { createLinks } from "./links.js";
import { createMailer } from "./mailer.js";
import { createNotification } from "./notification.js";
import { createStore } from "./store.js";

const config = loadConfig({
  PORT: { type: "port", default: 3007 },
  LOG_LEVEL: { default: "info" },
  MONGO_URL: { type: "url" },
  RABBITMQ_URL: { type: "url" },
  SMTP_HOST: {},
  SMTP_PORT: { type: "port" },
  SMTP_USER: { optional: true },
  SMTP_PASSWORD: { optional: true },
  EMAIL_FROM: { default: "Yai's Kitchen <hello@yais-kitchen.local>" },
  ADMIN_EMAIL: {},
  WEB_ORIGIN: { type: "url" },
  // When not set, the mock server answers for catalog.
  CATALOG_URL: { type: "url", optional: true },
  MOCK_URL: { type: "url", default: "http://127.0.0.1:4010" },
  INTERNAL_TOKEN: {},
  REMINDER_CHECK_MS: { type: "integer", default: 30_000 },
});

const service = "notification";
const logger = createLogger({ service, level: config.LOG_LEVEL });

const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: service,
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();
const store = createStore(connection);
await store.init();

const mailer = createMailer({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  user: config.SMTP_USER,
  password: config.SMTP_PASSWORD,
  from: config.EMAIL_FROM,
});
const catalogUrl = config.CATALOG_URL ?? config.MOCK_URL;
logger.info({ catalogUrl }, "reading class times from catalog here");

const { handlers, reminders } = createNotification({
  store,
  mailer,
  catalog: createCatalogClient({
    baseUrl: catalogUrl,
    internalToken: config.INTERNAL_TOKEN,
  }),
  links: createLinks(config.WEB_ORIGIN),
  adminEmail: config.ADMIN_EMAIL,
  logger,
});

const events = await connectEvents({
  url: config.RABBITMQ_URL,
  service,
  logger,
});
await events.consume(handlers);
reminders.start(config.REMINDER_CHECK_MS);

const app = createApp({
  service,
  logger,
  spec: false,
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
    await reminders.stop();
    await events.close();
    mailer.close();
    await connection.close();
  },
});
