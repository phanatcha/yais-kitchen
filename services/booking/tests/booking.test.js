import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createStore } from "../src/models/store.js";
import { createBookingApp } from "../src/app.js";
import { share } from "../src/services/booking.js";
import { harness, ids } from "./helpers.js";

describe("booking transactions and API", () => {
  let h, app, api, token;
  beforeAll(async () => {
    h = await harness(createStore);
    app = createBookingApp(h.options);
    api = app.locals.service;
    token = await h.auth();
  }, 120000);
  afterAll(async () => {
    await h?.close();
  });
  beforeEach(async () => {
    await h.clear();
    h.clock.time = Date.parse("2027-01-01T00:00:00Z");
    h.ctx.classTime.status = "published";
    h.ctx.classTime.helperId = ids.helper;
    h.ctx.classTime.capacity = 6;
    h.ctx.classTime.startsAt = "2027-01-04T00:00:00.000Z";
  });
  const hold = (guests = 1, key = randomUUID()) =>
    api.hold({ classTimeId: ids.time, guests }, key);
  async function booked() {
    const held = await hold();
    return api.create(held.id, h.user);
  }
  const event = (type, data) => ({
    id: randomUUID(),
    type,
    data,
    version: 1,
    occurredAt: new Date().toISOString(),
  });
  async function paid(b) {
    await api.handlers["payment.succeeded"](
      event("payment.succeeded", {
        bookingId: b.id,
        paymentId: ids.other,
        amount: b.total,
        method: "card",
      }),
    );
  }
  it("creates a valid hold through the validated API", async () => {
    const res = await request(app)
      .post("/booking/holds")
      .set("Idempotency-Key", randomUUID())
      .send({ classTimeId: ids.time, guests: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.total.amount).toBe(180002);
    expect(+new Date(res.body.expiresAt) - h.clock.time).toBe(600000);
  });
  it("validates My Classes, checklist, ratings, earnings and payout API responses", async () => {
    const admin = await h.auth("admin");
    const held = await hold();
    const created = await request(app)
      .post("/booking/bookings")
      .set("Authorization", token)
      .set("Idempotency-Key", randomUUID())
      .send({ holdId: held.id });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const booking = created.body;
    expect(
      (
        await request(app)
          .get("/booking/bookings?when=upcoming&limit=1")
          .set("Authorization", token)
      ).status,
    ).toBe(200);
    const checklist = await request(app)
      .put(`/booking/bookings/${booking.id}/checklist`)
      .set("Authorization", token)
      .send({ checkedIngredientIds: ["rice"] });
    expect(checklist.status, JSON.stringify(checklist.body)).toBe(200);
    await paid(booking);
    h.clock.time = +new Date(booking.endsAt);
    await api.handlers["live_class.ended"](
      event("live_class.ended", { classTimeId: ids.time }),
    );
    const rating = await request(app)
      .post(`/booking/bookings/${booking.id}/rating`)
      .set("Authorization", token)
      .send({ stars: 5, highlights: ["warm_yai"] });
    expect(rating.status, JSON.stringify(rating.body)).toBe(201);
    for (const path of [
      "/booking/ratings",
      `/booking/earnings?yaiId=${ids.yai}`,
      "/booking/payouts",
    ]) {
      const res = await request(app).get(path).set("Authorization", admin);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    const payout = await request(app)
      .post("/booking/payouts")
      .set("Authorization", admin)
      .send({
        yaiId: ids.yai,
        periodStart: "2027-01-04",
        periodEnd: "2027-01-10",
      });
    expect(payout.status, JSON.stringify(payout.body)).toBe(201);
    const marked = await request(app)
      .post(`/booking/payouts/${payout.body.id}/mark-paid`)
      .set("Authorization", admin)
      .send({ reference: "manual-test-reference" });
    expect(marked.status, JSON.stringify(marked.body)).toBe(200);
    expect(marked.body.status).toBe("paid");
  });
  it("keeps manual paid-payout history while recording refund recovery", async () => {
    const booking = await booked();
    await paid(booking);
    h.clock.time = +new Date(booking.endsAt);
    await api.handlers["live_class.ended"](
      event("live_class.ended", { classTimeId: ids.time }),
    );
    const payout = await api.payout({
      yaiId: ids.yai,
      periodStart: "2027-01-04",
      periodEnd: "2027-01-10",
    });
    await api.markPaid(payout.id, "original-reference");
    await api.markPaid(payout.id, "replacement-reference");
    await api.cancel(booking.id, { role: "admin" });
    const stored = await h.store.Payout.findById(payout.id);
    expect(stored.reference).toBe("original-reference");
    expect(stored.amount.amount).toBe(67500);
    expect(stored.refundAdjustments[0]).toMatchObject({
      amount: -67500,
      recoveryRequired: true,
    });
  });
  it("maintenance persists expiry without depending on TTL deletion", async () => {
    const booking = await booked();
    h.clock.time += 600000;
    await api.maintenance();
    expect((await api.get(booking.id, h.user)).status).toBe("expired");
    expect((await hold(6)).guests).toBe(6);
  });
  it("terminal refunds cannot be reversed by a delayed success event", async () => {
    const b = await booked();
    await api.handlers["payment.refunded"](
      event("payment.refunded", { bookingId: b.id, amount: b.total }),
    );
    await paid(b);
    expect((await api.get(b.id, h.user)).status).toBe("refunded");
    expect((await hold(6)).guests).toBe(6);
  });
  it("persists a cancellation fence even before any seats have been allocated", async () => {
    await api.handlers["class_time.cancelled"](
      event("class_time.cancelled", { classTimeId: ids.time }),
    );
    await expect(hold()).rejects.toMatchObject({ status: 409 });
  });
  it("expired holds stop consuming capacity before cleanup", async () => {
    await hold(6);
    h.clock.time += 600000;
    expect((await hold(6)).guests).toBe(6);
  });
  it("rejects conversion after exactly ten minutes", async () => {
    const held = await hold();
    h.clock.time += 600000;
    await expect(api.create(held.id, h.user)).rejects.toMatchObject({
      code: "hold_expired",
    });
  });
  it("releases cancelled holds", async () => {
    const held = await hold(6);
    await api.release(held.id);
    expect((await hold(6)).guests).toBe(6);
  });
  it("serializes simultaneous requests for the last seat against real MongoDB", async () => {
    await hold(5);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => hold()),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await api.availability({ classId: ids.class })).items[0].seatsLeft,
    ).toBe(0);
  });
  it("rejects a seventh guest through validation", async () => {
    const res = await request(app)
      .post("/booking/holds")
      .set("Idempotency-Key", randomUUID())
      .send({ classTimeId: ids.time, guests: 7 });
    expect(res.status).toBe(400);
  });
  it("replays a hold key and rejects a changed request", async () => {
    const key = randomUUID();
    const a = await hold(2, key);
    expect((await hold(2, key)).id).toBe(a.id);
    await expect(hold(3, key)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects past classes", async () => {
    h.ctx.classTime.startsAt = "2026-01-01T00:00:00Z";
    await expect(hold()).rejects.toMatchObject({ status: 409 });
  });
  it("rejects missing helper", async () => {
    h.ctx.classTime.helperId = null;
    await expect(hold()).rejects.toMatchObject({ status: 409 });
  });
  it("rejects sample classes", async () => {
    h.ctx.class.isSample = true;
    await expect(hold()).rejects.toMatchObject({ status: 409 });
    h.ctx.class.isSample = false;
  });
  it("creates pending booking and confirms exactly once after payment", async () => {
    const b = await booked();
    expect(b.status).toBe("pending_payment");
    await paid(b);
    await paid(b);
    expect((await api.get(b.id, h.user)).status).toBe("confirmed");
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "booking.confirmed" }),
    ).toBe(1);
  });
  it("deduplicates the same payment envelope", async () => {
    const b = await booked();
    const e = event("payment.succeeded", {
      bookingId: b.id,
      paymentId: ids.other,
      amount: b.total,
      method: "card",
    });
    await api.handlers[e.type](e);
    await api.handlers[e.type](e);
    expect(await h.connection.collection("inbox").countDocuments()).toBe(1);
  });
  it("allows own booking and rejects another tourist", async () => {
    const b = await booked();
    expect(
      (
        await request(app)
          .get(`/booking/bookings/${b.id}`)
          .set("Authorization", token)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`/booking/bookings/${b.id}`)
          .set("Authorization", await h.auth("tourist", ids.other))
      ).status,
    ).toBe(403);
  });
  it("isolates guest checkout sessions", async () => {
    const held = await hold();
    const guest = { ...h.user, role: "guest", sessionId: "checkout-a" };
    const b = await api.create(held.id, guest);
    await expect(
      api.get(b.id, { ...guest, sessionId: "checkout-b" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allows 49h cancellation, publishes refund and releases capacity", async () => {
    const b = await booked();
    await paid(b);
    h.clock.time = +new Date(b.startsAt) - 49 * 3600000;
    const cancelled = await api.cancel(b.id, h.user);
    expect(cancelled.refundStatus).toBe("pending");
    expect((await hold(6)).guests).toBe(6);
    const row = await h.connection
      .collection("outbox")
      .findOne({ type: "booking.cancelled" });
    expect(row.data.refund).toEqual(b.total);
  });
  it("rejects 47h cancellation", async () => {
    const b = await booked();
    await paid(b);
    h.clock.time = +new Date(b.startsAt) - 47 * 3600000;
    await expect(api.cancel(b.id, h.user)).rejects.toMatchObject({
      code: "cancellation_closed",
    });
  });
  it("persists checklist across reads", async () => {
    const b = await booked();
    await api.checklist(b.id, ["rice"], h.user);
    expect((await api.get(b.id, h.user)).checkedIngredientIds).toEqual([
      "rice",
    ]);
  });
  it("rejects ratings before completion and duplicate ratings", async () => {
    const b = await booked();
    await expect(api.rate(b.id, { stars: 5 }, h.user)).rejects.toMatchObject({
      status: 409,
    });
    await paid(b);
    h.clock.time = +new Date(b.endsAt);
    await api.handlers["live_class.ended"](
      event("live_class.ended", {
        classTimeId: ids.time,
        endedAt: new Date(h.clock.time).toISOString(),
      }),
    );
    await api.rate(b.id, { stars: 5 }, h.user);
    await expect(api.rate(b.id, { stars: 5 }, h.user)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("rounds Yai earnings down and prevents duplicate payout inclusion", async () => {
    const b = await booked();
    await paid(b);
    h.clock.time = +new Date(b.endsAt);
    await api.handlers["live_class.ended"](
      event("live_class.ended", { classTimeId: ids.time }),
    );
    expect(share(90001)).toBe(67500);
    const earnings = await api.earnings({ yaiId: ids.yai }, { role: "admin" });
    expect(earnings.total.amount).toBe(67500);
    const p = await api.payout({
      yaiId: ids.yai,
      periodStart: "2027-01-04",
      periodEnd: "2027-01-10",
    });
    expect(
      (
        await api.payout({
          yaiId: ids.yai,
          periodStart: "2027-01-04",
          periodEnd: "2027-01-10",
        })
      ).id,
    ).toBe(p.id);
    await expect(
      api.payout({
        yaiId: ids.yai,
        periodStart: "2027-01-01",
        periodEnd: "2027-01-11",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refunds late payment without reclaiming seats", async () => {
    const b = await booked();
    h.clock.time += 600001;
    await hold(6);
    await paid(b);
    expect((await api.get(b.id, h.user)).status).toBe("cancelled");
    expect(
      (
        await h.connection
          .collection("outbox")
          .findOne({ type: "booking.cancelled" })
      ).data.cancelledBy,
    ).toBe("paid_after_expiry");
  });
  it("refunded bookings do not earn revenue", async () => {
    const b = await booked();
    await paid(b);
    await api.cancel(b.id, h.user);
    await api.handlers["payment.refunded"](
      event("payment.refunded", { bookingId: b.id, amount: b.total }),
    );
    expect(
      (await api.earnings({ yaiId: ids.yai }, { role: "admin" })).total.amount,
    ).toBe(0);
  });
});
