import express from "express";
import { rateLimit } from "express-rate-limit";
import { createApp, tooManyRequests } from "@yais-kitchen/shared";
import { createPaymentService } from "./services/payment.js";
export function createPaymentApp(options) {
  const service = createPaymentService(options);
  const routes = express.Router();
  routes.get("/payment/refunds", async (req, res) =>
    res.json(await service.refunds(req.query)),
  );
  routes.post(
    "/payment/intents",
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, next) => next(tooManyRequests(60)),
    }),
    async (req, res) =>
      res.status(201).json(await service.create(req.body, req.user)),
  );
  routes.get("/payment/methods", async (req, res) =>
    res.json({ methods: await service.methods() }),
  );
  routes.get("/payment/payments", async (req, res) =>
    res.json(await service.list(req.query)),
  );
  routes.get("/payment/payments/:paymentId", async (req, res) =>
    res.json(await service.get(req.params.paymentId, req.user)),
  );
  routes.post("/payment/webhooks/stripe", async (req, res) => {
    await service.webhook(req.rawBody, req.get("stripe-signature"));
    res.status(200).end();
  });
  routes.post("/internal/payment/refunds", async (req, res) =>
    res.json(await service.refund(req.body.bookingId)),
  );
  routes.get("/internal/payment/refunds/:refundId", async (req, res) =>
    res.json(await service.refundStatus(req.params.refundId)),
  );
  const app = createApp({
    ...options,
    service: "payment",
    routes,
    auth: {
      verifyToken: options.verifyToken,
      internalToken: options.internalToken,
    },
  });
  app.locals.service = service;
  return app;
}
