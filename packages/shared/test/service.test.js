import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, startService } from "../src/service.js";
import { loadApiSpec } from "../src/spec.js";
import { captureLogs } from "./helpers.js";

const spec = loadApiSpec();

function build(options = {}) {
  const { lines, logger } = captureLogs();
  const app = createApp({ service: "test", logger, spec, ...options });
  return { app, lines, logger };
}

describe("health and readiness", () => {
  it("/health answers while the process runs, and isn't logged", async () => {
    const { app, lines } = build();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "test" });
    expect(lines).toHaveLength(0);
  });

  it("/ready answers 200 when every check passes", async () => {
    const { app } = build({
      ready: { mongo: () => true, events: async () => "yes" },
    });
    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ready",
      checks: { mongo: "ok", events: "ok" },
    });
  });

  it("/ready answers 503 and names the check that failed, threw or hung", async () => {
    const { app } = build({
      readyTimeoutMs: 20,
      ready: {
        mongo: () => false,
        events: () => {
          throw new Error("down");
        },
        slow: () => new Promise(() => {}),
        fine: () => true,
      },
    });
    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "not_ready",
      checks: { mongo: "failed", events: "failed", slow: "failed", fine: "ok" },
    });
  });

  it("/ready answers 503 while the service stops", async () => {
    const { app } = build();
    app.locals.stopping = true;
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
  });
});

describe("every request", () => {
  it("gets security headers and no X-Powered-By", async () => {
    const { app } = build();
    const res = await request(app).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("keeps the gateway's request ID, or makes a new one", async () => {
    const { app } = build();

    const kept = await request(app)
      .get("/health")
      .set("x-request-id", "req_from_gateway_123");
    expect(kept.headers["x-request-id"]).toBe("req_from_gateway_123");

    const made = await request(app).get("/health");
    expect(made.headers["x-request-id"]).toMatch(/^req_[0-9a-f-]{36}$/);

    const unsafe = await request(app)
      .get("/health")
      .set("x-request-id", "<script> id");
    expect(unsafe.headers["x-request-id"]).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("puts the request ID on every log line, including the service's own", async () => {
    const routes = express.Router();
    let logger;
    routes.post("/auth/codes", async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.info("sending a code");
      res.status(202).end();
    });
    const built = build({ routes });
    logger = built.logger;

    const res = await request(built.app)
      .post("/auth/codes")
      .send({ email: "guest@example.com" });
    const requestId = res.headers["x-request-id"];

    expect(built.lines.map((line) => [line.msg, line.requestId])).toEqual([
      ["sending a code", requestId],
      ["request finished", requestId],
    ]);
    expect(built.lines[1]).toMatchObject({
      service: "test",
      method: "POST",
      path: "/auth/codes",
      status: 202,
    });
  });

  it("keeps the raw body for webhook signature checks", async () => {
    const routes = express.Router();
    routes.post("/payment/webhooks/stripe", (req, res) =>
      res.json({ raw: req.rawBody.toString("utf8") }),
    );
    routes.post("/live/webhooks/livekit", (req, res) =>
      res.json({ event: req.body.event }),
    );
    const { app } = build({ routes });

    const body = '{"id":"evt_1","type":"payment_intent.succeeded"}';
    const stripe = await request(app)
      .post("/payment/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=abc")
      .set("content-type", "application/json")
      .send(body);
    expect(stripe.body.raw).toBe(body);

    const livekit = await request(app)
      .post("/live/webhooks/livekit")
      .set("authorization", "signed-by-livekit")
      .set("content-type", "application/webhook+json")
      .send('{"event":"egress_ended"}');
    expect(livekit.body.event).toBe("egress_ended");
  });

  it("can check responses against the spec, for tests", async () => {
    const routes = express.Router();
    routes.get("/catalog/faq", (req, res) => res.json({ wrong: "shape" }));
    const { app } = build({ routes, validateResponses: true });

    const res = await request(app).get("/catalog/faq");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
  });
});

describe("startService", () => {
  it("listens, then stops once, closing the server before onStop", async () => {
    const { app, logger } = build();
    const order = [];
    const onStop = vi.fn(async () => order.push("onStop"));
    const service = await startService({
      app,
      port: 0,
      logger,
      onStop,
      handleSignals: false,
    });

    const res = await fetch(`http://127.0.0.1:${service.port}/health`);
    expect(res.status).toBe(200);

    service.server.on("close", () => order.push("server closed"));
    await Promise.all([service.stop("test"), service.stop("again")]);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["server closed", "onStop"]);
    expect(app.locals.stopping).toBe(true);
    expect(service.server.listening).toBe(false);
  });

  it("fails when the port is taken", async () => {
    const { app, logger } = build();
    const first = await startService({
      app,
      port: 0,
      logger,
      handleSignals: false,
    });

    await expect(
      startService({ app, port: first.port, logger, handleSignals: false }),
    ).rejects.toThrow(/EADDRINUSE/);
    await first.stop();
  });
});
