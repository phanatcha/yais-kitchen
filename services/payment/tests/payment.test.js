import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { createStore } from "../src/models/store.js";
import { createPaymentApp } from "../src/app.js";
import { createStripeProvider } from "../src/services/stripe.js";
import { harness, ids } from "../../booking/tests/helpers.js";

describe("payment API and signed webhooks", () => {
  let h, app, api, b, provider, intent, token;
  const stripe = new Stripe("sk_test_local_only");
  const secret = "whsec_local_only";
  beforeAll(async () => {
    h = await harness(createStore);
    token = await h.auth();
  }, 120000);
  afterAll(async () => h?.close());
  beforeEach(async () => {
    await h.clear();
    b = {
      id: ids.time,
      holdId: "a".repeat(48),
      userId: ids.user,
      status: "pending_payment",
      total: { amount: 90000, currency: "THB" },
      expiresAt: new Date(h.clock.time + 600000).toISOString(),
    };
    intent = {
      id: "pi_test",
      client_secret: "pi_test_secret_local",
      amount: 90000,
      amount_received: 90000,
      currency: "thb",
      livemode: false,
    };
    provider = {
      methods: vi.fn(async () => ["card"]),
      create: vi.fn(async () => intent),
      retrieve: vi.fn(async () => intent),
      verify: (raw, signature) =>
        stripe.webhooks.constructEvent(raw, signature, secret),
      refund: vi.fn(async (p, r) => ({
        id: "re_test",
        amount: r.amount,
        payment_intent: p.stripePaymentIntentId,
        status: "succeeded",
      })),
    };
    app = createPaymentApp({ ...h.options, booking: async () => b, provider });
    api = app.locals.service;
  });
  async function create(method = "card") {
    return api.create({ bookingId: b.id, method }, h.user);
  }
  async function webhook(
    type,
    object = intent,
    eventId = randomUUID(),
    signature = true,
  ) {
    const raw = JSON.stringify({
      id: eventId,
      type,
      livemode: false,
      data: { object },
    });
    return request(app)
      .post("/payment/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set(
        "Stripe-Signature",
        signature
          ? stripe.webhooks.generateTestHeaderString({ payload: raw, secret })
          : "invalid",
      )
      .send(raw);
  }
  async function succeeded() {
    const payment = await create();
    const res = await webhook("payment_intent.succeeded");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return payment;
  }
  it("creates an authoritative card intent through API", async () => {
    const res = await request(app)
      .post("/payment/intents")
      .set("Authorization", token)
      .set("Idempotency-Key", randomUUID())
      .send({ bookingId: b.id, method: "card" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.amount.amount).toBe(90000);
  });
  it("validates status, method, admin payment and refund API responses", async () => {
    const payment = await succeeded();
    const status = await request(app)
      .get(`/payment/payments/${payment.paymentId}`)
      .set("Authorization", token);
    expect(status.status, JSON.stringify(status.body)).toBe(200);
    expect(status.body.status).toBe("succeeded");
    expect(
      (await request(app).get("/payment/methods").set("Authorization", token))
        .body.methods,
    ).toEqual(["card"]);
    const admin = await h.auth("admin");
    expect(
      (
        await request(app)
          .get("/payment/payments?limit=1")
          .set("Authorization", admin)
      ).status,
    ).toBe(200);
    const refund = await api.refund(b.id);
    const list = await request(app)
      .get("/payment/refunds")
      .set("Authorization", admin);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const detail = await request(app)
      .get(`/internal/payment/refunds/${refund._id}`)
      .set("X-Internal-Token", h.options.internalToken);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(
      (await request(app).get("/payment/refunds").set("Authorization", token))
        .status,
    ).toBe(403);
  });
  it("rejects invalid booking ownership", async () => {
    b.userId = ids.other;
    await expect(create()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects expired hold", async () => {
    b.expiresAt = new Date(h.clock.time).toISOString();
    await expect(create()).rejects.toMatchObject({ status: 409 });
  });
  it("rejects client amount manipulation", async () => {
    const res = await request(app)
      .post("/payment/intents")
      .set("Authorization", token)
      .set("Idempotency-Key", randomUUID())
      .send({ bookingId: b.id, method: "card", amount: 1 });
    expect(res.status).toBe(400);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("reports available methods without fabricating PromptPay", async () => {
    expect(await api.methods()).toEqual(["card"]);
  });
  it("rejects live-mode keys", () => {
    expect(() =>
      createStripeProvider({ secretKey: "sk_live_forbidden" }),
    ).toThrow(/test-mode/);
  });
  it("accepts a real SDK signature and publishes success", async () => {
    await succeeded();
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "payment.succeeded" }),
    ).toBe(1);
  });
  it("rejects invalid webhook signature", async () => {
    expect(
      (await webhook("payment_intent.succeeded", intent, randomUUID(), false))
        .status,
    ).toBe(400);
  });
  it("deduplicates webhook events", async () => {
    await create();
    const eid = randomUUID();
    await webhook("payment_intent.succeeded", intent, eid);
    await webhook("payment_intent.succeeded", intent, eid);
    expect(await h.connection.collection("outbox").countDocuments()).toBe(1);
  });
  it("publishes failed payment", async () => {
    await create();
    expect((await webhook("payment_intent.payment_failed")).status).toBe(200);
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "payment.failed" }),
    ).toBe(1);
  });
  it("creates a full refund and publishes confirmed refund", async () => {
    await succeeded();
    const refund = await api.refund(b.id);
    expect(refund.status).toBe("succeeded");
    expect(refund.amount).toBe(90000);
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "payment.refunded" }),
    ).toBe(1);
  });
  it("duplicate refund requests are idempotent", async () => {
    await succeeded();
    await api.refund(b.id);
    await api.refund(b.id);
    expect(provider.refund).toHaveBeenCalledTimes(1);
  });
  it("rejects browser refund commands", async () => {
    const res = await request(app)
      .post("/internal/payment/refunds")
      .set("Authorization", token)
      .send({ bookingId: b.id });
    expect(res.status).toBe(401);
  });
  it("refuses refunds above captured amount", async () => {
    await succeeded();
    const payment = await h.store.Payment.findOne();
    await h.store.Refund.create({
      _id: ids.other,
      paymentId: payment._id,
      bookingId: b.id,
      amount: 90001,
      status: "requested",
    });
    await expect(api.refund(b.id)).rejects.toMatchObject({ status: 409 });
  });
  it("tracks failed refunds for recovery", async () => {
    await succeeded();
    provider.refund.mockImplementation(async (p, r) => ({
      id: "re_failed",
      amount: r.amount,
      payment_intent: p.stripePaymentIntentId,
      status: "failed",
    }));
    expect((await api.refund(b.id)).status).toBe("failed");
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "payment.refund.failed" }),
    ).toBe(1);
  });
  it("does not regress success for out-of-order failure", async () => {
    const p = await succeeded();
    await webhook("payment_intent.payment_failed");
    expect((await api.get(p.paymentId, h.user)).status).toBe("succeeded");
  });
  it("does not expose provider secrets", async () => {
    provider.create.mockRejectedValue(
      new Error("sk_test_secret_do_not_expose"),
    );
    const res = await request(app)
      .post("/payment/intents")
      .set("Authorization", token)
      .set("Idempotency-Key", randomUUID())
      .send({ bookingId: b.id, method: "card" });
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("sk_test");
  });
  it("amount mismatch is not acknowledged", async () => {
    await create();
    const res = await webhook("payment_intent.succeeded", {
      ...intent,
      amount: 1,
    });
    expect(res.status).toBe(400);
    expect(await h.connection.collection("outbox").countDocuments()).toBe(0);
  });
  it("replays intent creation without another charge", async () => {
    const p = await create();
    expect((await create()).paymentId).toBe(p.paymentId);
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
});
