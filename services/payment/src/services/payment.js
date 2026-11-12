import mongoose from "mongoose";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from "@yais-kitchen/shared";

const id = () => new mongoose.Types.ObjectId().toString();
const money = (amount) => ({ amount, currency: "THB" });
export function createPaymentService({
  store: s,
  durable: d,
  booking,
  provider,
  now = () => new Date(),
}) {
  function owner(p, user) {
    if (
      user.role !== "admin" &&
      (p.userId !== user.id ||
        (user.role === "guest" && p.guestSessionId !== user.sessionId))
    )
      throw forbidden();
  }
  function view(p) {
    return {
      id: p._id,
      bookingId: p.bookingId,
      status: p.status,
      amount: money(p.amount),
      method: p.method,
      createdAt: new Date(p.createdAt).toISOString(),
      ...(p.refundedAt && { refundedAt: new Date(p.refundedAt).toISOString() }),
    };
  }
  async function providerCall(work) {
    try {
      return await work();
    } catch (e) {
      if (e.status && e.code === "method_unavailable") throw e;
      throw serviceUnavailable(
        "The payment provider is temporarily unavailable.",
      );
    }
  }
  const api = {
    async refunds(query) {
      const limit = Number(query.limit || 20);
      const rows = await s.Refund.find(
        query.cursor ? { _id: { $gt: query.cursor } } : {},
      )
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
      return {
        items: rows.slice(0, limit).map((r) => ({ ...r, id: r._id })),
        nextCursor: rows.length > limit ? rows[limit - 1]._id : null,
      };
    },
    async maintenance() {
      // Recover crash between Stripe response and local refund persistence.
      const pending = await s.Refund.find({ status: "requested" })
        .limit(100)
        .lean();
      for (const r of pending) await api.refund(r.bookingId, r.reason);
    },
    methods: () => providerCall(() => provider.methods()),
    async create(input, user) {
      const b = await booking(`/internal/booking/bookings/${input.bookingId}`);
      owner(b, user);
      if (
        b.status !== "pending_payment" ||
        !b.expiresAt ||
        new Date(b.expiresAt) <= now()
      )
        throw conflict("hold_expired", "This booking cannot be paid.");
      if (
        b.total.currency !== "THB" ||
        !Number.isSafeInteger(b.total.amount) ||
        b.total.amount < 1
      )
        throw badRequest("Invalid booking amount.");
      let p;
      try {
        p = await s.Payment.findOneAndUpdate(
          { bookingId: b.id },
          {
            $setOnInsert: {
              _id: id(),
              userId: b.userId,
              guestSessionId: b.guestSessionId,
              holdId: b.holdId,
              amount: b.total.amount,
              currency: "THB",
              method: input.method,
              status: "requires_payment",
            },
          },
          { upsert: true, returnDocument: "after" },
        );
      } catch (e) {
        if (e.code !== 11000) throw e;
        p = await s.Payment.findOne({ bookingId: b.id });
      }
      if (p.method !== input.method)
        throw conflict(
          "payment_exists",
          "This booking already uses another payment method.",
        );
      const intent = await providerCall(() =>
        p.stripePaymentIntentId
          ? provider.retrieve(p.stripePaymentIntentId)
          : provider.create(p),
      );
      if (intent.livemode !== false)
        throw badRequest("Live payments are disabled.");
      await s.Payment.updateOne(
        { _id: p._id },
        { stripePaymentIntentId: intent.id },
      );
      return {
        paymentId: p._id,
        clientSecret: intent.client_secret,
        amount: money(p.amount),
        method: p.method,
      };
    },
    async get(paymentId, user) {
      const p = await s.Payment.findById(paymentId);
      if (!p) throw notFound();
      owner(p, user);
      return view(p);
    },
    async list(query) {
      const filter = {};
      for (const key of ["bookingId", "status"])
        if (query[key]) filter[key] = query[key];
      if (query.cursor) filter._id = { $gt: query.cursor };
      const limit = Number(query.limit || 20);
      const rows = await s.Payment.find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1);
      return {
        items: rows.slice(0, limit).map(view),
        nextCursor: rows.length > limit ? rows[limit - 1]._id : null,
      };
    },
    async webhook(raw, signature) {
      let event;
      try {
        event = await provider.verify(raw, signature);
      } catch {
        throw badRequest("Invalid Stripe signature.");
      }
      if (event.livemode !== false)
        throw badRequest("Live payments are disabled.");
      // Persist failed processing as well, but acknowledge only a committed transition.
      await s.WebhookEvent.updateOne(
        { _id: event.id },
        {
          $setOnInsert: {
            eventType: event.type,
            processingStatus: "received",
            retryCount: 0,
          },
        },
        { upsert: true },
      );
      try {
        await d.receive(event, async (session) => {
          const obj = event.data.object;
          if (event.type.startsWith("payment_intent.")) {
            let p = await s.Payment.findOne({
              stripePaymentIntentId: obj.id,
            }).session(session);
            // Creation can finish at Stripe before its HTTP response reaches us.
            if (!p && obj.metadata?.paymentId)
              p = await s.Payment.findById(obj.metadata.paymentId).session(
                session,
              );
            if (!p)
              throw serviceUnavailable("Payment record not available yet.");
            if (
              obj.amount !== p.amount ||
              obj.currency !== "thb" ||
              obj.livemode !== false
            )
              throw badRequest("Payment verification failed.");
            if (
              event.type === "payment_intent.succeeded" &&
              !["succeeded", "refunded"].includes(p.status)
            ) {
              if (obj.amount_received !== p.amount)
                throw badRequest("Captured amount mismatch.");
              p.status = "succeeded";
              p.stripePaymentIntentId = obj.id;
              await p.save({ session });
              await d.enqueue(session, "payment.succeeded", {
                paymentId: p._id,
                bookingId: p.bookingId,
                amount: money(p.amount),
                method: p.method,
              });
            } else if (
              event.type === "payment_intent.payment_failed" &&
              !["succeeded", "refunded", "failed"].includes(p.status)
            ) {
              p.status = "failed";
              await p.save({ session });
              await d.enqueue(session, "payment.failed", {
                paymentId: p._id,
                bookingId: p.bookingId,
                reason:
                  obj.last_payment_error?.decline_code || "payment_failed",
              });
            }
          } else if (
            ["refund.created", "refund.updated", "refund.failed"].includes(
              event.type,
            )
          ) {
            const r = await s.Refund.findOne({
              $or: [
                { stripeRefundId: obj.id },
                { _id: obj.metadata?.refundId || "unknown" },
              ],
            }).session(session);
            if (!r)
              throw serviceUnavailable("Refund record not available yet.");
            await applyRefund(r, obj, session);
          }
          await s.WebhookEvent.updateOne(
            { _id: event.id },
            { processingStatus: "processed", processedAt: now() },
            { session },
          );
        });
      } catch (error) {
        await s.WebhookEvent.updateOne(
          { _id: event.id },
          { $set: { processingStatus: "failed" }, $inc: { retryCount: 1 } },
        );
        throw error;
      }
      return { received: true };
    },
    async refund(bookingId, reason = "booking_cancelled") {
      const p = await s.Payment.findOne({ bookingId });
      if (!p || !["succeeded", "refunded"].includes(p.status)) return null;
      let r;
      try {
        r = await s.Refund.findOneAndUpdate(
          { paymentId: p._id },
          {
            $setOnInsert: {
              _id: id(),
              bookingId,
              amount: p.amount,
              status: "requested",
              reason,
            },
          },
          { upsert: true, returnDocument: "after" },
        );
      } catch (e) {
        if (e.code !== 11000) throw e;
        r = await s.Refund.findOne({ paymentId: p._id });
      }
      if (["succeeded", "pending"].includes(r.status)) return r.toObject();
      if (r.amount > p.amount || r.amount <= 0)
        throw conflict("refund_amount", "Invalid refundable amount.");
      const result = await providerCall(() => provider.refund(p, r));
      await d.transaction(async (session) => {
        const current = await s.Refund.findById(r._id).session(session);
        await applyRefund(current, result, session);
      });
      return (await s.Refund.findById(r._id)).toObject();
    },
    async refundStatus(refundId) {
      const r = await s.Refund.findById(refundId).lean();
      if (!r) throw notFound();
      return { ...r, id: r._id };
    },
    handlers: {
      "booking.cancelled": async (event) => {
        // Provider work has its own durable record and Stripe idempotency key.
        await api.refund(event.data.bookingId, event.data.cancelledBy);
        await d.receive(event, async () => {});
      },
    },
  };
  async function applyRefund(r, obj, session) {
    const p = await s.Payment.findById(r.paymentId).session(session);
    if (
      obj.amount !== r.amount ||
      obj.payment_intent !== p.stripePaymentIntentId
    )
      throw badRequest("Refund verification failed.");
    if (r.status === "succeeded") return;
    const prior = r.status;
    r.stripeRefundId = obj.id;
    r.status = obj.status;
    r.history.push({ status: obj.status, at: now() });
    await r.save({ session });
    if (obj.status === "succeeded") {
      p.status = "refunded";
      p.refundedAt = now();
      await p.save({ session });
      await d.enqueue(session, "payment.refunded", {
        paymentId: p._id,
        bookingId: p.bookingId,
        amount: money(r.amount),
      });
    } else if (
      ["failed", "canceled"].includes(obj.status) &&
      prior !== obj.status
    )
      await d.enqueue(session, "payment.refund.failed", {
        paymentId: p._id,
        bookingId: p.bookingId,
        reason: "provider_refund_failed",
      });
  }
  return api;
}
