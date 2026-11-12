import mongoose from "mongoose";
import { internalClient, runBackend } from "@yais-kitchen/shared";
import { createStore } from "./models/store.js";
import { createLiveApp } from "./app.js";
import { createLiveKitProvider } from "./services/livekit.js";
await runBackend({
  service: "live-class",
  port: 3005,
  createStore,
  createApp: createLiveApp,
  connectDatabase: (url, dbName) =>
    mongoose
      .createConnection(url, { dbName, serverSelectionTimeoutMS: 5000 })
      .asPromise(),
  variables: {
    CATALOG_URL: { type: "url" },
    BOOKING_URL: { type: "url" },
    MEDIA_URL: { type: "url", optional: true },
    LIVEKIT_URL: { type: "url" },
    LIVEKIT_API_KEY: {},
    LIVEKIT_API_SECRET: {},
  },
  configure(config) {
    const media = config.MEDIA_URL
      ? internalClient(config.MEDIA_URL, config.INTERNAL_TOKEN)
      : undefined;
    return {
      catalog: internalClient(config.CATALOG_URL, config.INTERNAL_TOKEN),
      booking: internalClient(config.BOOKING_URL, config.INTERNAL_TOKEN),
      media,
      provider: createLiveKitProvider({
        url: config.LIVEKIT_URL,
        apiKey: config.LIVEKIT_API_KEY,
        apiSecret: config.LIVEKIT_API_SECRET,
        media,
      }),
    };
  },
});
