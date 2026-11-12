import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createEventChecker, createDurable } from "@yais-kitchen/shared";
import { createStore as bookingStore } from "../src/models/store.js";
import { createStore as paymentStore } from "../../payment/src/models/store.js";
import { createStore as liveStore } from "../../live-class/src/models/store.js";
import { createBookingApp } from "../src/app.js";
import { createPaymentApp } from "../../payment/src/app.js";
import { createLiveApp } from "../../live-class/src/app.js";
import { createGatewayApp } from "../../gateway/src/app.js";
import { harness, ids } from "./helpers.js";

describe("cross-service business journeys with isolated databases", () => {
  let h,
    paymentConnection,
    liveConnection,
    b,
    p,
    l,
    paymentApp,
    durablePayment,
    durableLive,
    intent,
    notifications;
  const checkEvent = createEventChecker();
  beforeAll(async () => {
    h = await harness(bookingStore);
    paymentConnection = h.connection.useDb("journey-payment", {
      useCache: true,
    });
    liveConnection = h.connection.useDb("journey-live", { useCache: true });
    const ps = paymentStore(paymentConnection),
      ls = liveStore(liveConnection);
    await ps.init();
    await ls.init();
    durablePayment = createDurable(paymentConnection);
    durableLive = createDurable(liveConnection);
    b = createBookingApp(h.options).locals.service;
    intent = {
      id: "pi_journey",
      client_secret: "test_secret",
      livemode: false,
      amount: 90001,
      amount_received: 90001,
      currency: "thb",
    };
    paymentApp = createPaymentApp({
      ...h.options,
      store: ps,
      durable: durablePayment,
      booking: async (path) => b.get(path.split("/").pop()),
      provider: {
        methods: async () => ["card"],
        create: async () => intent,
        retrieve: async () => intent,
        verify: async (raw) => JSON.parse(raw),
        refund: async (p, r) => ({
          id: "re_journey",
          payment_intent: p.stripePaymentIntentId,
          amount: r.amount,
          status: "succeeded",
        }),
      },
    });
    p = paymentApp.locals.service;
    l = createLiveApp({
      ...h.options,
      store: ls,
      durable: durableLive,
      booking: async () => b.participants(ids.time),
      provider: {
        serverUrl: "wss://example.test",
        room: async () => {},
        token: async () => "token",
        participants: async () => [],
        end: async () => {},
        broadcast: async () => {},
      },
    }).locals.service;
  }, 120000);
  afterAll(async () => h?.close());
  beforeEach(async () => {
    await h.clear();
    for (const conn of [paymentConnection, liveConnection])
      for (const c of Object.values(conn.collections)) await c.deleteMany({});
    h.clock.time = Date.parse("2027-01-01T00:00:00Z");
    notifications = [];
  });
  async function pump() {
    const transport = {
      async publish(type, data, options) {
        const event = {
          id: options.id,
          occurredAt: options.occurredAt,
          type,
          data,
          version: 1,
        };
        checkEvent(event);
        for (const service of [b, p, l])
          if (service.handlers[type]) await service.handlers[type](event);
        if (
          [
            "booking.confirmed",
            "booking.cancelled",
            "payment.refunded",
          ].includes(type)
        )
          notifications.push(event);
        return event;
      },
    };
    for (let cycle = 0; cycle < 4; cycle++)
      for (const durable of [durablePayment, h.durable, durableLive])
        await durable.flush(transport);
  }
  async function checkout() {
    const hold = await b.hold(
      { classTimeId: ids.time, guests: 1 },
      randomUUID(),
    );
    const booking = await b.create(hold.id, h.user);
    await p.create({ bookingId: booking.id, method: "card" }, h.user);
    return booking;
  }
  async function pay() {
    await p.webhook(
      Buffer.from(
        JSON.stringify({
          id: randomUUID(),
          type: "payment_intent.succeeded",
          livemode: false,
          data: { object: intent },
        }),
      ),
      "test",
    );
    await pump();
  }
  it("hold → payment → notification → live steps → completion → rating → earnings", async () => {
    const booking = await checkout();
    await pay();
    expect((await b.get(booking.id, h.user)).status).toBe("confirmed");
    expect(notifications.some((e) => e.type === "booking.confirmed")).toBe(
      true,
    );
    h.clock.time = +new Date(booking.startsAt) - 600000;
    expect((await b.get(booking.id, h.user)).joinPermitted).toBe(true);
    expect((await l.join(ids.time, h.user)).token).toBe("token");
    const helper = { id: ids.helper, role: "helper" };
    await l.step(ids.time, 1, helper);
    h.clock.time = +new Date(booking.endsAt);
    await l.end(ids.time, helper);
    await pump();
    expect((await b.get(booking.id, h.user)).status).toBe("completed");
    await b.rate(booking.id, { stars: 5 }, h.user);
    expect(
      (await b.earnings({ yaiId: ids.yai }, { role: "admin" })).total.amount,
    ).toBe(67500);
  });
  it("confirmed cancellation → refund → released seats and no earnings", async () => {
    const booking = await checkout();
    await pay();
    await b.cancel(booking.id, h.user);
    await pump();
    expect((await b.get(booking.id, h.user)).status).toBe("refunded");
    expect(
      (await b.availability({ classId: ids.class })).items[0].seatsLeft,
    ).toBe(6);
    expect(
      (await b.earnings({ yaiId: ids.yai }, { role: "admin" })).total.amount,
    ).toBe(0);
  });
  it("expired hold → late successful charge → full refund without overselling", async () => {
    const booking = await checkout();
    h.clock.time += 600001;
    await b.hold({ classTimeId: ids.time, guests: 6 }, randomUUID());
    await pay();
    expect((await b.get(booking.id, h.user)).status).toBe("refunded");
    expect(
      (await b.availability({ classId: ids.class })).items[0].seatsLeft,
    ).toBe(0);
  });
  it("gateway preserves signed webhook bytes and routes payment independently", async () => {
    await checkout();
    const server = paymentApp.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const gateway = createGatewayApp({
        logger: h.options.logger,
        verifyToken: h.options.verifyToken,
        upstreams: Object.fromEntries(
          ["auth", "catalog", "booking", "payment", "live", "media"].map(
            (name) => [name, url],
          ),
        ),
        webOrigin: "http://localhost:5173",
      });
      const raw = JSON.stringify({
        id: randomUUID(),
        type: "payment_intent.succeeded",
        livemode: false,
        data: { object: intent },
      });
      const res = await request(gateway)
        .post("/api/payment/webhooks/stripe")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", "test")
        .send(raw);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
