import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@yais-kitchen/shared";

const id = () => new mongoose.Types.ObjectId().toString();
export const share = (amount) => Number((BigInt(amount) * 3n) / 4n);
export const money = (amount) => ({ amount, currency: "THB" });
const iso = (value) => new Date(value).toISOString();

export function createBookingService({
  store: s,
  durable: d,
  catalog,
  now = () => new Date(),
}) {
  const { Hold, Booking, Allocation, Rating, Payout } = s;
  async function lock(classTimeId, session) {
    await Allocation.updateOne(
      { _id: classTimeId },
      { $inc: { revision: 1 } },
      { session },
    );
    const allocation = await Allocation.findById(classTimeId).session(session);
    return allocation;
  }
  async function initialize(classTimeId) {
    try {
      await Allocation.updateOne(
        { _id: classTimeId },
        { $setOnInsert: { revision: 0 } },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  function bookable(ctx) {
    const t = ctx.classTime;
    if (
      t.status !== "published" ||
      !t.helperId ||
      new Date(t.startsAt) <= now() ||
      (ctx.class.isSample && ctx.class.bookable !== true)
    )
      throw conflict("not_bookable", "This class time is not bookable.");
    if (
      !Number.isSafeInteger(ctx.class.price.amount) ||
      ctx.class.price.amount < 1 ||
      ctx.class.price.currency !== "THB"
    )
      throw badRequest("Invalid catalog price.");
    return Math.min(6, t.capacity);
  }
  async function used(classTimeId, session) {
    const rows = await Hold.find({
      classTimeId,
      released: { $ne: true },
      $or: [{ expiresAt: { $gt: now() } }, { expiresAt: null }],
    })
      .session(session ?? null)
      .lean();
    return rows.reduce((total, row) => total + row.guests, 0);
  }
  function own(b, user, family = true) {
    if (user.role === "admin") return;
    if (family && user.role === "family" && user.yaiId === b.yaiId) return;
    if (
      user.id !== b.userId ||
      (user.role === "guest" && user.sessionId !== b.guestSessionId)
    )
      throw forbidden();
  }
  async function find(bookingId, session) {
    const b = await Booking.findById(bookingId).session(session ?? null);
    if (!b) throw notFound();
    return b;
  }
  function view(b, user) {
    const row = b.toObject ? b.toObject() : b;
    const { _id, email, guestSessionId, ...rest } = row;
    void email;
    void guestSessionId;
    return {
      ...rest,
      id: _id,
      guestName:
        user?.role === "family" ? row.guestName.split(" ")[0] : row.guestName,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      createdAt: iso(row.createdAt),
      joinOpensAt: iso(+new Date(row.startsAt) - 600000),
      cancellableUntil: iso(+new Date(row.startsAt) - 172800000),
      joinPermitted:
        row.status === "confirmed" &&
        now() >= +new Date(row.startsAt) - 600000 &&
        now() < new Date(row.endsAt),
    };
  }
  async function cancel(b, by, session) {
    if (["cancelled", "refunded"].includes(b.status)) return;
    await lock(b.classTimeId, session);
    b.status = "cancelled";
    b.cancelledAt = now();
    b.cancelledBy = by;
    b.refundStatus = b.paymentId ? "pending" : "none";
    await b.save({ session });
    await Hold.updateOne({ _id: b.holdId }, { released: true }, { session });
    if (b.payoutId) {
      const payout = await Payout.findById(b.payoutId).session(session);
      if (
        payout &&
        !payout.refundAdjustments.some((a) => a.bookingId === b._id)
      ) {
        const adjustment = {
          bookingId: b._id,
          amount: -share(b.total.amount),
          at: now(),
          recoveryRequired: payout.status === "paid",
        };
        payout.refundAdjustments.push(adjustment);
        if (payout.status === "due") {
          payout.amount.amount += adjustment.amount;
          payout.markModified("amount");
        }
        await payout.save({ session });
      }
    }
    // Also emitted for unpaid cancellation: payment safely ignores absent payments.
    await d.enqueue(session, "booking.cancelled", {
      bookingId: b._id,
      userId: b.userId,
      email: b.email,
      name: b.guestName,
      classTimeId: b.classTimeId,
      startsAt: iso(b.startsAt),
      cancelledBy: by,
      refund: b.total,
    });
  }
  const api = {
    async maintenance() {
      const candidates = await Hold.find({
        expiresAt: { $lte: now() },
        released: { $ne: true },
      })
        .limit(100)
        .lean();
      for (const h of candidates)
        await d.transaction(async (session) => {
          await lock(h.classTimeId, session);
          await Hold.updateOne(
            { _id: h._id, expiresAt: { $lte: now() } },
            { released: true },
            { session },
          );
          await Booking.updateOne(
            { holdId: h._id, status: "pending_payment" },
            { status: "expired" },
            { session },
          );
        });
    },
    async availability(query) {
      const list = await catalog(
        `/internal/catalog/class-times?${new URLSearchParams(query)}`,
      );
      const items = [];
      for (const t of list.items) {
        const ctx = await catalog(`/internal/catalog/class-times/${t.id}`);
        try {
          const capacity = bookable(ctx);
          items.push({
            classTimeId: t.id,
            startsAt: t.startsAt,
            endsAt: t.endsAt,
            thailandTime: new Date(t.startsAt).toLocaleString("sv-SE", {
              timeZone: "Asia/Bangkok",
            }),
            seatsLeft: Math.max(0, capacity - (await used(t.id))),
          });
        } catch (e) {
          if (e.status !== 409) throw e;
        }
      }
      return { items };
    },
    async hold(input, key) {
      if (!key) throw badRequest("An Idempotency-Key header is required.");
      if (
        !Number.isInteger(input.guests) ||
        input.guests < 1 ||
        input.guests > 6
      )
        throw badRequest("Choose between one and six guests.");
      const ctx = await catalog(
        `/internal/catalog/class-times/${input.classTimeId}`,
      );
      const capacity = bookable(ctx);
      if (!Number.isSafeInteger(ctx.class.price.amount * input.guests))
        throw badRequest("Booking amount exceeds the supported range.");
      await initialize(input.classTimeId);
      return d.transaction(async (session) => {
        const allocation = await lock(input.classTimeId, session);
        const old = await Hold.findOne({ key }).session(session);
        if (old) {
          if (
            old.classTimeId !== input.classTimeId ||
            old.guests !== input.guests
          )
            throw conflict(
              "idempotency_conflict",
              "Use a new idempotency key for different seats.",
            );
          return api.holdView(old);
        }
        if (
          allocation.closed ||
          input.guests + (await used(input.classTimeId, session)) > capacity
        )
          throw conflict("not_enough_seats", "There are not enough seats.");
        const [h] = await Hold.create(
          [
            {
              _id: randomBytes(24).toString("hex"),
              key,
              ...input,
              context: ctx,
              expiresAt: new Date(+now() + 600000),
              released: false,
            },
          ],
          { session },
        );
        return api.holdView(h);
      });
    },
    holdView: (h) => ({
      id: h._id,
      classTimeId: h.classTimeId,
      guests: h.guests,
      total: money(h.context.class.price.amount * h.guests),
      expiresAt: iso(h.expiresAt),
    }),
    async release(holdId) {
      const h = await Hold.findById(holdId);
      if (!h) return;
      await d.transaction(async (session) => {
        await lock(h.classTimeId, session);
        await Hold.updateOne(
          { _id: holdId, bookingId: null },
          { released: true },
          { session },
        );
      });
    },
    async create(holdId, user) {
      const h = await Hold.findById(holdId);
      if (!h) throw notFound();
      return d.transaction(async (session) => {
        const allocation = await lock(h.classTimeId, session);
        const old = await Booking.findOne({ holdId }).session(session);
        if (old) {
          own(old, user, false);
          return view(old);
        }
        const hold = await Hold.findById(holdId).session(session);
        if (allocation.closed || hold.released || hold.expiresAt <= now())
          throw conflict("hold_expired", "The seat hold expired.");
        const ctx = hold.context;
        const [b] = await Booking.create(
          [
            {
              _id: id(),
              holdId,
              userId: user.id,
              guestSessionId: user.sessionId,
              email: user.email,
              guestName: user.name || "Guest",
              classTimeId: hold.classTimeId,
              yaiId: ctx.yai.id,
              class: ctx.class,
              guests: hold.guests,
              total: money(ctx.class.price.amount * hold.guests),
              startsAt: ctx.classTime.startsAt,
              endsAt: ctx.classTime.endsAt,
              expiresAt: hold.expiresAt,
              status: "pending_payment",
              ingredients: ctx.ingredients,
              checkedIngredientIds: [],
            },
          ],
          { session },
        );
        hold.bookingId = b._id;
        await hold.save({ session });
        return view(b);
      });
    },
    async get(bookingId, user) {
      const b = await find(bookingId);
      if (user) own(b, user);
      const result = view(b, user);
      if (!user) result.guestSessionId = b.guestSessionId;
      return result;
    },
    async list(query, user) {
      const filter = {};
      if (user.role === "family") filter.yaiId = user.yaiId || "unassigned";
      else if (user.role !== "admin") filter.userId = user.id;
      for (const key of ["status", "classTimeId", "yaiId"])
        if (query[key]) {
          if (filter[key] && filter[key] !== query[key]) throw forbidden();
          filter[key] = query[key];
        }
      if (query.when)
        filter.startsAt =
          query.when === "past" ? { $lt: now() } : { $gte: now() };
      if (query.cursor) filter._id = { $gt: query.cursor };
      const limit = Number(query.limit || 20);
      const rows = await Booking.find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1);
      return {
        items: rows.slice(0, limit).map((b) => view(b, user)),
        nextCursor: rows.length > limit ? rows[limit - 1]._id : null,
      };
    },
    async cancel(bookingId, user) {
      return d.transaction(async (session) => {
        const b = await find(bookingId, session);
        own(b, user, false);
        if (
          !["cancelled", "refunded"].includes(b.status) &&
          user.role !== "admin" &&
          +b.startsAt - +now() < 172800000
        )
          throw conflict(
            "cancellation_closed",
            "Cancellation closes 48 hours before class.",
          );
        await cancel(b, user.role, session);
        return view(b);
      });
    },
    async checklist(bookingId, checkedIngredientIds, user) {
      const b = await find(bookingId);
      own(b, user, false);
      if (
        checkedIngredientIds.some((x) => !b.ingredients.some((i) => i.id === x))
      )
        throw badRequest("Unknown ingredient.");
      b.checkedIngredientIds = checkedIngredientIds;
      await b.save();
      return view(b);
    },
    async rate(bookingId, input, user) {
      return d.transaction(async (session) => {
        const b = await find(bookingId, session);
        own(b, user, false);
        if (b.status !== "completed" || b.endsAt > now())
          throw conflict(
            "not_completed",
            "Complete the class before rating it.",
          );
        if (b.isRated)
          throw conflict("already_rated", "This booking is already rated.");
        b.isRated = true;
        await b.save({ session });
        const [r] = await Rating.create(
          [
            {
              _id: id(),
              bookingId,
              userId: user.id,
              classId: b.class.id,
              yaiId: b.yaiId,
              highlights: [],
              ...input,
            },
          ],
          { session },
        );
        return r.toObject();
      });
    },
    async participants(classTimeId) {
      return {
        userIds: await Booking.distinct("userId", {
          classTimeId,
          status: { $in: ["confirmed", "completed"] },
        }),
      };
    },
    async earnings(query, user) {
      if (user.role === "family" && user.yaiId !== query.yaiId)
        throw forbidden();
      const filter = { yaiId: query.yaiId, status: "completed" };
      if (query.from || query.to)
        filter.endsAt = {
          ...(query.from && { $gte: new Date(query.from) }),
          ...(query.to && { $lte: new Date(query.to) }),
        };
      const rows = await Booking.find(filter).lean();
      const groups = new Map();
      for (const b of rows) {
        const key =
          query.groupBy === "class" ? b.class.id : iso(b.endsAt).slice(0, 7);
        const group = groups.get(key) || {
          key,
          label: key,
          bookings: 0,
          yaiShare: money(0),
        };
        group.bookings++;
        group.yaiShare.amount += share(b.total.amount);
        groups.set(key, group);
      }
      return {
        yaiId: query.yaiId,
        groupBy: query.groupBy || "month",
        rows: [...groups.values()],
        total: money(
          [...groups.values()].reduce((a, b) => a + b.yaiShare.amount, 0),
        ),
      };
    },
    async page(model, query, user) {
      const filter = {};
      if (user.role === "family") filter.yaiId = user.yaiId || "unassigned";
      if (query.yaiId) {
        if (filter.yaiId && filter.yaiId !== query.yaiId) throw forbidden();
        filter.yaiId = query.yaiId;
      }
      if (query.status) filter.status = query.status;
      if (query.cursor) filter._id = { $gt: query.cursor };
      const limit = Number(query.limit || 20);
      const rows = await model
        .find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
      return {
        items: rows.slice(0, limit).map((r) => ({ ...r, id: r._id })),
        nextCursor: rows.length > limit ? rows[limit - 1]._id : null,
      };
    },
    async payout(input) {
      if (new Date(input.periodStart) > new Date(input.periodEnd))
        throw badRequest("Payout period ends before it starts.");
      return d.transaction(async (session) => {
        const existing = await Payout.findOne(input).session(session);
        if (existing) return { ...existing.toObject(), id: existing._id };
        const rows = await Booking.find({
          yaiId: input.yaiId,
          status: "completed",
          payoutId: null,
          endsAt: {
            $gte: new Date(input.periodStart),
            $lt: new Date(+new Date(input.periodEnd) + 86400000),
          },
        }).session(session);
        if (!rows.length)
          throw conflict("no_earnings", "No unpaid earnings in this period.");
        const payoutId = id();
        await Booking.updateMany(
          { _id: { $in: rows.map((b) => b._id) }, payoutId: null },
          { payoutId },
          { session },
        );
        const [p] = await Payout.create(
          [
            {
              _id: payoutId,
              ...input,
              bookingIds: rows.map((b) => b._id),
              amount: money(
                rows.reduce((a, b) => a + share(b.total.amount), 0),
              ),
              status: "due",
            },
          ],
          { session },
        );
        return { ...p.toObject(), id: p._id };
      });
    },
    async markPaid(payoutId, reference) {
      let p = await Payout.findOneAndUpdate(
        { _id: payoutId, status: "due" },
        { $set: { status: "paid", reference, paidAt: now() } },
        { returnDocument: "after" },
      );
      p ??= await Payout.findById(payoutId);
      if (!p) throw notFound();
      return { ...p.toObject(), id: p._id };
    },
    handlers: {
      "payment.succeeded": (event) =>
        d.receive(event, async (session) => {
          const b = await find(event.data.bookingId, session);
          await lock(b.classTimeId, session);
          if (
            b.total.amount !== event.data.amount.amount ||
            event.data.amount.currency !== "THB"
          )
            throw badRequest("Payment amount mismatch.");
          if (
            b.status === "refunded" ||
            (b.paymentId === event.data.paymentId &&
              ["confirmed", "completed", "refunded"].includes(b.status))
          )
            return;
          b.paymentId = event.data.paymentId;
          const h = await Hold.findById(b.holdId).session(session);
          if (b.status === "cancelled" || h.released || h.expiresAt <= now()) {
            b.status = "pending_payment";
            await cancel(b, "paid_after_expiry", session);
            return;
          }
          b.status = "confirmed";
          b.confirmedAt = now();
          await b.save({ session });
          h.expiresAt = null;
          await h.save({ session });
          await d.enqueue(session, "booking.confirmed", {
            bookingId: b._id,
            userId: b.userId,
            email: b.email,
            name: b.guestName,
            classTimeId: b.classTimeId,
            classId: b.class.id,
            yaiId: b.yaiId,
            yaiName: b.class.yaiName,
            dish: b.class.dish,
            startsAt: iso(b.startsAt),
            endsAt: iso(b.endsAt),
            guests: b.guests,
            total: b.total,
          });
        }),
      "payment.failed": (event) =>
        d.receive(event, async (session) => {
          await Booking.updateOne(
            { _id: event.data.bookingId, status: "pending_payment" },
            { refundStatus: "payment_failed" },
            { session },
          );
        }),
      "payment.refunded": (event) =>
        d.receive(event, async (session) => {
          const b = await find(event.data.bookingId, session);
          await lock(b.classTimeId, session);
          if (event.data.amount.amount !== b.total.amount)
            throw badRequest("Refund amount mismatch.");
          b.refundStatus = "succeeded";
          b.status = "refunded";
          await b.save({ session });
          await Hold.updateOne(
            { _id: b.holdId },
            { released: true },
            { session },
          );
        }),
      "payment.refund.failed": (event) =>
        d.receive(event, async (session) => {
          await Booking.updateOne(
            { _id: event.data.bookingId, status: "cancelled" },
            { refundStatus: "failed" },
            { session },
          );
        }),
      "live_class.ended": (event) =>
        d.receive(event, async (session) => {
          await Booking.updateMany(
            {
              classTimeId: event.data.classTimeId,
              status: "confirmed",
              startsAt: { $lte: now() },
            },
            { status: "completed" },
            { session },
          );
        }),
      "class_time.cancelled": async (event) => {
        await initialize(event.data.classTimeId);
        return d.receive(event, async (session) => {
          await lock(event.data.classTimeId, session);
          await Allocation.updateOne(
            { _id: event.data.classTimeId },
            { closed: true },
            { session },
          );
          for (const b of await Booking.find({
            classTimeId: event.data.classTimeId,
            status: { $in: ["pending_payment", "confirmed"] },
          }).session(session))
            await cancel(b, "class_time_cancelled", session);
        });
      },
    },
  };
  return api;
}
