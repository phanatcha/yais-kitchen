import mongoose from "mongoose";
import { internalClient, runBackend } from "@yais-kitchen/shared";
import { createStore } from "./models/store.js";
import { createBookingApp } from "./app.js";
await runBackend({
  service: "booking",
  port: 3003,
  createStore,
  createApp: createBookingApp,
  connectDatabase: (url, dbName) =>
    mongoose
      .createConnection(url, { dbName, serverSelectionTimeoutMS: 5000 })
      .asPromise(),
  variables: { CATALOG_URL: { type: "url" } },
  configure: (config) => ({
    catalog: internalClient(config.CATALOG_URL, config.INTERNAL_TOKEN),
  }),
});
