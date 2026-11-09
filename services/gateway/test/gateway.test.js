import { randomUUID } from "node:crypto";
import http from "node:http";
import { createLogger, createTokenVerifier } from "@yais-kitchen/shared";
import { createTestKeys } from "@yais-kitchen/shared/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGatewayApp, gatewaySpec, resolveUpstreams } from "../src/app.js";
import { SERVICES } from "../src/proxy.js";
import {
  createRateLimiter,
  RATE_LIMIT_KEYS,
  rateLimitsOf,
} from "../src/rate-limit.js";

const WEB_ORIGIN = "http://localhost:5173";
const ID = "6650a1f2c3d4e5f6a7b8c9d1";
const logger = createLogger({ service: "gateway-test", level: "silent" });

// Stands in for one service. It records what reached it and, unless a test
// says otherwise, answers with its own name and the path it got.
async function startFakeService(name) {
  const fake = { name, calls: [], reply: null };
  fake.server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const call = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    fake.calls.push(call);
    if (fake.reply) return fake.reply(res, call);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ service: name, url: req.url }));
  });
  await new Promise((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${fake.server.address().port}`;
  return fake;
}

let keys;
let verifyToken;
let fakes;
let upstreams;

beforeAll(async () => {
  keys = await createTestKeys();
  verifyToken = await createTokenVerifier(keys.publicKeyPem);
  fakes = Object.fromEntries(
    await Promise.all(
      SERVICES.map(async (service) => [
        service,
        await startFakeService(service),
      ]),
    ),
  );
  upstreams = Object.fromEntries(
    SERVICES.map((service) => [service, fakes[service].url]),
  );
});

afterAll(async () => {
  for (const fake of Object.values(fakes)) {
    fake.server.closeAllConnections();
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

beforeEach(() => {
  for (const fake of Object.values(fakes)) {
    fake.calls = [];
    fake.reply = null;
  }
});

const gateway = (options = {}) =>
  createGatewayApp({
    logger,
    verifyToken,
    upstreams,
    webOrigin: WEB_ORIGIN,
    ...options,
  });

const bearer = async (role, claims = {}) =>
  `Bearer ${await keys.signToken({ role, ...claims })}`;

const forwardedCount = () =>
  Object.values(fakes).reduce((sum, fake) => sum + fake.calls.length, 0);

describe("routing", () => {
  const routes = [
    ["auth", "post", "/auth/codes", { body: { email: "guest@example.com" } }],
    ["catalog", "get", "/catalog/yais?limit=5", {}],
    ["booking", "get", `/booking/class-times?classId=${ID}`, {}],
    [
      "payment",
      "post",
      "/payment/intents",
      {
        role: "tourist",
        headers: { "idempotency-key": randomUUID() },
        body: { bookingId: ID, method: "card" },
      },
    ],
    ["live", "post", `/live/class-times/${ID}/join`, { role: "helper" }],
    [
      "media",
      "post",
      "/media/uploads",
      {
        role: "family",
        body: { kind: "photo", contentType: "image/jpeg", sizeBytes: 1000 },
      },
    ],
  ];

  it.each(routes)(
    "sends %s paths to the %s service, without /api",
    async (service, method, path, { role, headers = {}, body }) => {
      let req = request(gateway())[method](`/api${path}`).set(headers);
      if (role) req = req.set("authorization", await bearer(role));
      if (body) req = req.send(body);
      const res = await req;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ service, url: path });
      expect(forwardedCount()).toBe(1);
    },
  );

  it("forwards the token and the request ID, and drops headers callers may not set", async () => {
    const token = await bearer("tourist");
    const res = await request(gateway())
      .get("/api/auth/me")
      .set("authorization", token)
      .set("x-internal-token", "stolen")
      .set("x-forwarded-for", "203.0.113.9");

    const [call] = fakes.auth.calls;
    expect(call.headers.authorization).toBe(token);
    expect(call.headers["x-request-id"]).toBe(res.headers["x-request-id"]);
    expect(call.headers["x-internal-token"]).toBeUndefined();
    expect(call.headers["x-forwarded-for"]).not.toContain("203.0.113.9");
    expect(call.headers.host).toBe(new URL(fakes.auth.url).host);
  });

  it("passes the service's answer back unchanged, cookies and errors included", async () => {
    const error = {
      error: {
        code: "hold_expired",
        message: "Your seats were let go.",
        requestId: "req_x",
        retryable: false,
      },
    };
    fakes.auth.reply = (res) => {
      res.writeHead(409, {
        "content-type": "application/json",
        "set-cookie": ["yk_refresh=a; HttpOnly", "other=b"],
      });
      res.end(JSON.stringify(error));
    };

    const res = await request(gateway())
      .post("/api/auth/sessions")
      .send({ email: "guest@example.com", code: "123456" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(error);
    expect(res.headers["set-cookie"]).toEqual([
      "yk_refresh=a; HttpOnly",
      "other=b",
    ]);
  });

  it("forwards webhook bodies byte for byte, so signatures still match", async () => {
    const raw = '{"id":"evt_1",  "type":"payment_intent.succeeded" }';
    await request(gateway())
      .post("/api/payment/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=abc")
      .set("content-type", "application/json")
      .send(raw);

    expect(fakes.payment.calls[0].body).toBe(raw);
    expect(fakes.payment.calls[0].headers["stripe-signature"]).toBe(
      "t=1,v1=abc",
    );
  });

  it("sends services that aren't built yet to the mock server", () => {
    const config = {
      MOCK_URL: "http://127.0.0.1:4010",
      AUTH_URL: "http://auth:3001",
    };
    expect(resolveUpstreams(config)).toEqual({
      auth: "http://auth:3001",
      catalog: "http://127.0.0.1:4010",
      booking: "http://127.0.0.1:4010",
      payment: "http://127.0.0.1:4010",
      live: "http://127.0.0.1:4010",
      media: "http://127.0.0.1:4010",
    });
  });
});

describe("tokens and roles", () => {
  it("answers 401 without a token, and forwards nothing", async () => {
    const res = await request(gateway()).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(forwardedCount()).toBe(0);
  });

  it("answers 401 for an expired token", async () => {
    const expired = await bearer("tourist", {
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await request(gateway())
      .get("/api/auth/me")
      .set("authorization", expired);

    expect(res.status).toBe(401);
    expect(forwardedCount()).toBe(0);
  });

  it("answers 403 for a role the spec doesn't allow", async () => {
    const res = await request(gateway())
      .post("/api/media/uploads")
      .set("authorization", await bearer("tourist"))
      .send({ kind: "photo", contentType: "image/jpeg", sizeBytes: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(forwardedCount()).toBe(0);
  });

  it("lets a guest pay, as the spec allows", async () => {
    const res = await request(gateway())
      .post("/api/payment/intents")
      .set("authorization", await bearer("guest"))
      .set("idempotency-key", randomUUID())
      .send({ bookingId: ID, method: "promptpay" });

    expect(res.status).toBe(200);
  });
});

describe("bad requests stop at the gateway", () => {
  it("never forwards /internal paths", async () => {
    const res = await request(gateway())
      .get(`/api/internal/catalog/class-times?classId=${ID}`)
      .set("x-internal-token", "a".repeat(40));

    expect(res.status).toBe(404);
    expect(forwardedCount()).toBe(0);
  });

  it("answers 404 for paths outside the spec", async () => {
    expect((await request(gateway()).get("/api/nowhere")).status).toBe(404);
    expect(forwardedCount()).toBe(0);
  });

  it("never forwards a path without /api, which would skip the checks", async () => {
    const app = gateway();
    expect((await request(app).get("/catalog/yais")).status).toBe(404);
    expect((await request(app).get("/auth/me")).status).toBe(404);
    for (let i = 0; i < 7; i += 1) {
      const res = await request(app)
        .post("/auth/codes")
        .send({ email: "guest@example.com" });
      expect(res.status).toBe(404);
    }
    expect(forwardedCount()).toBe(0);
  });

  it("answers 405 for a method the path doesn't have", async () => {
    const res = await request(gateway()).delete("/api/auth/codes");
    expect(res.status).toBe(405);
  });

  it("answers 400 for a body that breaks the spec", async () => {
    const res = await request(gateway())
      .post("/api/auth/codes")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("email");
    expect(forwardedCount()).toBe(0);
  });
});

describe("when a service is down or slow", () => {
  it("answers 503 if the service can't be reached", async () => {
    const closed = http.createServer();
    await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${closed.address().port}`;
    await new Promise((resolve) => closed.close(resolve));

    const res = await request(
      gateway({ upstreams: { ...upstreams, catalog: url } }),
    ).get("/api/catalog/yais");

    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({
      code: "service_unavailable",
      retryable: true,
    });
  });

  it("answers 504 if the service takes too long", async () => {
    fakes.catalog.reply = () => {};
    const res = await request(gateway({ timeoutMs: 100 })).get(
      "/api/catalog/yais",
    );

    expect(res.status).toBe(504);
    expect(res.body.error).toMatchObject({
      code: "upstream_timeout",
      retryable: true,
    });
  });
});

describe("CORS", () => {
  it("lets the web app read answers, errors included", async () => {
    const res = await request(gateway())
      .get("/api/auth/me")
      .set("origin", WEB_ORIGIN);

    expect(res.status).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-expose-headers"]).toContain(
      "X-Request-Id",
    );
    expect(res.headers.vary).toContain("Origin");
  });

  it("answers the web app's preflight", async () => {
    const res = await request(gateway())
      .options("/api/booking/holds")
      .set("origin", WEB_ORIGIN)
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "authorization, content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain(
      "Authorization",
    );
    expect(forwardedCount()).toBe(0);
  });

  it("gives other sites nothing to work with", async () => {
    const other = "https://evil.example";
    const get = await request(gateway())
      .get("/api/catalog/yais")
      .set("origin", other);
    expect(get.headers["access-control-allow-origin"]).toBeUndefined();

    const preflight = await request(gateway())
      .options("/api/catalog/yais")
      .set("origin", other)
      .set("access-control-request-method", "GET");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflight.headers["access-control-allow-methods"]).toBeUndefined();
  });

  it("ignores CORS headers from services, like the mock server's", async () => {
    // The mock server allows every origin with credentials. Passed through,
    // that would let any site read a signed-in person's answers.
    fakes.catalog.reply = (res, call) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": call.headers.origin ?? "*",
        "access-control-allow-credentials": "true",
        "access-control-expose-headers": "*",
        vary: "Accept-Encoding",
      });
      res.end(JSON.stringify({ items: [] }));
    };

    const other = await request(gateway())
      .get("/api/catalog/yais")
      .set("origin", "https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    expect(other.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(other.headers["access-control-expose-headers"]).toBeUndefined();

    const web = await request(gateway())
      .get("/api/catalog/yais")
      .set("origin", WEB_ORIGIN);
    expect(web.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(web.headers["access-control-expose-headers"]).toBe(
      "X-Request-Id, Retry-After",
    );
    expect(web.headers.vary).toContain("Origin");
    expect(web.headers.vary).toContain("Accept-Encoding");
  });
});

describe("rate limits from the spec", () => {
  it("blocks a flood of sign-in codes for one email", async () => {
    const app = gateway();
    const ask = (email) => request(app).post("/api/auth/codes").send({ email });

    for (const email of [
      "guest@example.com",
      "Guest@example.com",
      "GUEST@EXAMPLE.COM",
      "guest@example.com",
      "guest@Example.com",
    ]) {
      expect((await ask(email)).status).toBe(200);
    }
    const blocked = await ask("guest@example.com");

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
    expect(blocked.body.error).toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
    expect(fakes.auth.calls).toHaveLength(5);

    expect((await ask("someone@example.com")).status).toBe(200);
  });

  it("lets the email try again once the window has passed", async () => {
    let time = Date.parse("2026-11-20T09:00:00Z");
    const app = gateway({ limiter: createRateLimiter({ now: () => time }) });
    const ask = () =>
      request(app).post("/api/auth/codes").send({ email: "guest@example.com" });

    for (let i = 0; i < 5; i += 1) await ask();
    expect((await ask()).status).toBe(429);

    time += 900_000;
    expect((await ask()).status).toBe(200);
  });

  it("also limits sign-in codes from one address, whatever the email", async () => {
    const app = gateway();
    const ask = () =>
      request(app)
        .post("/api/auth/codes")
        .send({ email: `${randomUUID()}@example.com` });

    for (let i = 0; i < 20; i += 1) expect((await ask()).status).toBe(200);
    const blocked = await ask();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
  });

  it("counts a blocked request against every limit it passed", async () => {
    let time = Date.parse("2026-11-20T09:00:00Z");
    const app = gateway({ limiter: createRateLimiter({ now: () => time }) });
    const ask = (email) => request(app).post("/api/auth/codes").send({ email });

    for (let i = 0; i < 5; i += 1) await ask("guest@example.com");
    expect((await ask("guest@example.com")).status).toBe(429);
    time += 60_000;
    // 6 from this address so far: 14 more fit under the address limit.
    for (let i = 0; i < 14; i += 1)
      expect((await ask(`${i}@example.com`)).status).toBe(200);
    expect((await ask("last@example.com")).status).toBe(429);
  });

  it("limits sign-in tries by the caller's address", async () => {
    const app = gateway();
    const signIn = () =>
      request(app)
        .post("/api/auth/sessions")
        .send({ email: `${randomUUID()}@example.com`, code: "123456" });

    for (let i = 0; i < 10; i += 1) expect((await signIn()).status).toBe(200);
    expect((await signIn()).status).toBe(429);
  });

  it("limits payments for each signed-in person", async () => {
    const app = gateway();
    const pay = async (sub) =>
      request(app)
        .post("/api/payment/intents")
        .set("authorization", await bearer("tourist", { sub }))
        .set("idempotency-key", randomUUID())
        .send({ bookingId: ID, method: "card" });

    for (let i = 0; i < 10; i += 1) await pay(ID);
    expect((await pay(ID)).status).toBe(429);
    expect((await pay("6650a1f2c3d4e5f6a7b8c9d9")).status).toBe(200);
  });

  it("understands every x-rate-limit in the spec", () => {
    const rules = Object.values(gatewaySpec().paths)
      .flatMap((item) => Object.values(item))
      .flatMap((operation) => rateLimitsOf(operation));

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(RATE_LIMIT_KEYS).toContain(rule.key);
      expect(
        Number.isInteger(rule.windowSeconds) && rule.windowSeconds > 0,
      ).toBe(true);
      expect(Number.isInteger(rule.max) && rule.max > 0).toBe(true);
    }
  });
});

describe("createRateLimiter", () => {
  it("forgets the oldest caller when it is full", () => {
    const limiter = createRateLimiter({ maxKeys: 2 });
    expect(limiter.hit("a", 60_000, 1).allowed).toBe(true);
    expect(limiter.hit("a", 60_000, 1).allowed).toBe(false);
    limiter.hit("b", 60_000, 1);
    limiter.hit("c", 60_000, 1);

    expect(limiter.hit("a", 60_000, 1).allowed).toBe(true);
  });
});
