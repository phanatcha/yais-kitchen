import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExampleApp } from "../example/app.js";
import { createTokenVerifier } from "../src/auth.js";
import { startService } from "../src/service.js";
import { createTestKeys } from "../src/testing.js";
import { captureLogs } from "./helpers.js";

describe("the example service", () => {
  let keys;
  let service;
  let url;

  beforeAll(async () => {
    keys = await createTestKeys();
    const { logger } = captureLogs();
    const app = createExampleApp({
      logger,
      verifyToken: await createTokenVerifier(keys.publicKeyPem),
      ready: { always: () => true },
      validateResponses: true,
    });
    service = await startService({
      app,
      port: 0,
      logger,
      handleSignals: false,
    });
    url = `http://127.0.0.1:${service.port}`;
  });

  afterAll(() => service.stop());

  it("passes its health and readiness checks", async () => {
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", service: "example" });

    const ready = await fetch(`${url}/ready`);
    expect(ready.status).toBe(200);
  });

  it("answers a public route without a token", async () => {
    const res = await fetch(`${url}/auth/codes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@example.com" }),
    });
    expect(res.status).toBe(202);
  });

  it("answers a signed-in route with a response that matches the spec", async () => {
    const token = await keys.signToken({
      role: "tourist",
      email: "guest@example.com",
      name: "Alex",
    });
    const res = await fetch(`${url}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "6650a1f2c3d4e5f6a7b8c9d0",
      email: "guest@example.com",
      name: "Alex",
      role: "tourist",
    });
  });

  it("refuses the signed-in route without a token", async () => {
    const res = await fetch(`${url}/auth/me`);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });
});
