import mongoose from "mongoose";
import { internalClient, runBackend } from "@yais-kitchen/shared";
import { createStore } from "./models/store.js";
import { createPaymentApp } from "./app.js";
import { createStripeProvider } from "./services/stripe.js";
await runBackend({
  service: "payment",
  port: 3004,
  createStore,
  createApp: createPaymentApp,
  connectDatabase: (url, dbName) =>
    mongoose
      .createConnection(url, { dbName, serverSelectionTimeoutMS: 5000 })
      .asPromise(),
  variables: {
    BOOKING_URL: { type: "url" },
    STRIPE_SECRET_KEY: {},
    STRIPE_WEBHOOK_SECRET: {},
    STRIPE_PROMPTPAY_ENABLED: { default: "false" },
  },
  configure: (config) => ({
    booking: internalClient(config.BOOKING_URL, config.INTERNAL_TOKEN),
    provider: createStripeProvider({
      secretKey: config.STRIPE_SECRET_KEY,
      webhookSecret: config.STRIPE_WEBHOOK_SECRET,
      promptpayEnabled: config.STRIPE_PROMPTPAY_ENABLED === "true",
    }),
  }),
});
