import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createMediaApp } from "./app.js";
import { createProcessor } from "./process.js";
import { createStore } from "./store.js";

// Outside Docker, files go in .media/ at the repo root (git ignores it).
const LOCAL_DIR = fileURLToPath(new URL("../../../.media", import.meta.url));

const config = loadConfig({
  PORT: { type: "port", default: 3006 },
  LOG_LEVEL: { default: "info" },
  MONGO_URL: { type: "url" },
  AUTH_PUBLIC_KEY: { type: "pem" },
  MEDIA_DIR: { default: LOCAL_DIR },
  // This service's address as the browser sees it, for upload links and files.
  MEDIA_SELF_URL: { type: "url", default: "http://localhost:3006" },
  WEB_ORIGIN: { default: "http://localhost:5173" },
});

const service = "media";
const logger = createLogger({ service, level: config.LOG_LEVEL });

const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: service,
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();
const store = createStore(connection);
await store.init();

const dir = path.resolve(config.MEDIA_DIR);
const processAsset = createProcessor({ store, dir, logger });

// Files that were mid-way when media last stopped.
for (const asset of await store.Asset.find({ status: "processing" })) {
  processAsset(asset);
}

const app = createMediaApp({
  store,
  dir,
  publicUrl: config.MEDIA_SELF_URL,
  webOrigin: config.WEB_ORIGIN,
  processAsset,
  verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
  logger,
  ready: { database: () => connection.readyState === 1 },
});

await startService({
  app,
  port: config.PORT,
  logger,
  async onStop() {
    await connection.close();
  },
});
