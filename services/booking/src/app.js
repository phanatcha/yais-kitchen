import express from "express";
import { rateLimit } from "express-rate-limit";
import { createApp, tooManyRequests } from "@yais-kitchen/shared";
import { createBookingService } from "./services/booking.js";

export function createBookingApp(options) {
  const service = createBookingService(options);
  const routes = express.Router();
  routes.get("/booking/class-times", async (req, res) =>
    res.json(await service.availability(req.query)),
  );
  routes.post(
    "/booking/holds",
    rateLimit({
      windowMs: 600000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, next) => next(tooManyRequests(600)),
    }),
    async (req, res) =>
      res
        .status(201)
        .json(await service.hold(req.body, req.get("idempotency-key"))),
  );
  routes.delete("/booking/holds/:holdId", async (req, res) => {
    await service.release(req.params.holdId);
    res.status(204).end();
  });
  routes.post("/booking/bookings", async (req, res) =>
    res.status(201).json(await service.create(req.body.holdId, req.user)),
  );
  routes.get("/booking/bookings", async (req, res) =>
    res.json(await service.list(req.query, req.user)),
  );
  routes.get("/booking/bookings/:bookingId", async (req, res) =>
    res.json(await service.get(req.params.bookingId, req.user)),
  );
  routes.post("/booking/bookings/:bookingId/cancel", async (req, res) =>
    res.json(await service.cancel(req.params.bookingId, req.user)),
  );
  routes.put("/booking/bookings/:bookingId/checklist", async (req, res) =>
    res.json(
      await service.checklist(
        req.params.bookingId,
        req.body.checkedIngredientIds,
        req.user,
      ),
    ),
  );
  routes.post("/booking/bookings/:bookingId/rating", async (req, res) =>
    res
      .status(201)
      .json(await service.rate(req.params.bookingId, req.body, req.user)),
  );
  routes.get("/booking/ratings", async (req, res) =>
    res.json(await service.page(options.store.Rating, req.query, req.user)),
  );
  routes.get("/booking/earnings", async (req, res) =>
    res.json(await service.earnings(req.query, req.user)),
  );
  routes.get("/booking/payouts", async (req, res) =>
    res.json(await service.page(options.store.Payout, req.query, req.user)),
  );
  routes.post("/booking/payouts", async (req, res) =>
    res.status(201).json(await service.payout(req.body)),
  );
  routes.post("/booking/payouts/:payoutId/mark-paid", async (req, res) =>
    res.json(await service.markPaid(req.params.payoutId, req.body.reference)),
  );
  routes.get("/internal/booking/bookings/:bookingId", async (req, res) =>
    res.json(await service.get(req.params.bookingId)),
  );
  routes.get(
    "/internal/booking/class-times/:classTimeId/participants",
    async (req, res) =>
      res.json(await service.participants(req.params.classTimeId)),
  );
  const app = createApp({
    ...options,
    service: "booking",
    routes,
    auth: {
      verifyToken: options.verifyToken,
      internalToken: options.internalToken,
    },
  });
  app.locals.service = service;
  return app;
}
