import express from "express";
import { SignJWT } from "jose";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTokenVerifier,
  requireAuth,
  requireInternalToken,
  requireRole,
} from "../src/auth.js";
import { errorHandler } from "../src/errors.js";
import { createApp } from "../src/service.js";
import { loadApiSpec } from "../src/spec.js";
import { createTestKeys } from "../src/testing.js";
import { captureLogs } from "./helpers.js";

const INTERNAL_TOKEN = "internal-token-for-tests-0123456789abcdef";
const CLASS_ID = "6650a1f2c3d4e5f6a7b8c9d1";

let keys;
let verifyToken;

beforeAll(async () => {
  keys = await createTestKeys();
  verifyToken = await createTokenVerifier(keys.publicKeyPem);
});

describe("createTokenVerifier", () => {
  it("returns the person a valid token belongs to", async () => {
    const token = await keys.signToken({
      sub: "6650a1f2c3d4e5f6a7b8c9d0",
      role: "family",
      email: "family@example.com",
      name: "Noi",
      yaiId: "6650a1f2c3d4e5f6a7b8c9d2",
    });

    await expect(verifyToken(token)).resolves.toEqual({
      id: "6650a1f2c3d4e5f6a7b8c9d0",
      role: "family",
      email: "family@example.com",
      name: "Noi",
      yaiId: "6650a1f2c3d4e5f6a7b8c9d2",
    });
  });

  it("rejects an expired token", async () => {
    const token = await keys.signToken({
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifyToken(token)).rejects.toThrow();
  });

  it("rejects a token signed with another key", async () => {
    const other = await createTestKeys();
    await expect(verifyToken(await other.signToken())).rejects.toThrow();
  });

  it("rejects a token for another issuer or audience", async () => {
    await expect(
      verifyToken(await keys.signToken({ issuer: "someone-else" })),
    ).rejects.toThrow();
    await expect(
      verifyToken(await keys.signToken({ audience: "another-app" })),
    ).rejects.toThrow();
  });

  it("rejects a role that doesn't exist", async () => {
    await expect(
      verifyToken(await keys.signToken({ role: "superuser" })),
    ).rejects.toThrow();
  });

  it("rejects a token signed with a shared secret instead of the key", async () => {
    const forged = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("6650a1f2c3d4e5f6a7b8c9d0")
      .setIssuer("yais-kitchen-auth")
      .setAudience("yais-kitchen")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(keys.publicKeyPem));
    await expect(verifyToken(forged)).rejects.toThrow();
  });
});

describe("requireAuth and requireRole", () => {
  function app(...middleware) {
    const { logger } = captureLogs();
    const app = express();
    app.get("/", ...middleware, (req, res) => res.json(req.user));
    app.use(errorHandler(logger));
    return app;
  }

  it("let a valid token through and set req.user", async () => {
    const token = await keys.signToken({ role: "admin" });
    const res = await request(
      app(requireAuth(verifyToken), requireRole("admin")),
    )
      .get("/")
      .set("authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it.each([
    ["no header", undefined],
    ["the wrong scheme", "Basic abc"],
    ["a broken token", "Bearer not.a.token"],
  ])("answer 401 for %s", async (label, header) => {
    let req = request(app(requireAuth(verifyToken))).get("/");
    if (header) req = req.set("authorization", header);
    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("answer 403 for the wrong role", async () => {
    const token = await keys.signToken({ role: "tourist" });
    const res = await request(
      app(requireAuth(verifyToken), requireRole("admin", "family")),
    )
      .get("/")
      .set("authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("answer 401 when requireRole runs without requireAuth", async () => {
    const res = await request(app(requireRole("admin"))).get("/");
    expect(res.status).toBe(401);
  });

  it("refuse roles that don't exist", () => {
    expect(() => requireRole("owner")).toThrow(TypeError);
  });
});

describe("requireInternalToken", () => {
  function app() {
    const { logger } = captureLogs();
    const app = express();
    app.get("/", requireInternalToken(INTERNAL_TOKEN), (req, res) =>
      res.json({ ok: true }),
    );
    app.use(errorHandler(logger));
    return app;
  }

  it("lets the right token through", async () => {
    const res = await request(app())
      .get("/")
      .set("x-internal-token", INTERNAL_TOKEN);
    expect(res.status).toBe(200);
  });

  it("answers 401 for a missing or wrong token", async () => {
    expect((await request(app()).get("/")).status).toBe(401);
    const wrong = await request(app())
      .get("/")
      .set("x-internal-token", "wrong");
    expect(wrong.status).toBe(401);
  });

  it("refuses a short secret", () => {
    expect(() => requireInternalToken("short")).toThrow(TypeError);
  });
});

describe("the spec's rules, applied by createApp", () => {
  const spec = loadApiSpec();

  function app(auth = { verifyToken, internalToken: INTERNAL_TOKEN }) {
    const { logger } = captureLogs();
    const routes = express.Router();
    routes.post("/auth/codes", (req, res) => res.status(202).end());
    routes.get("/auth/me", (req, res) => res.json({ role: req.user.role }));
    routes.get("/auth/users", (req, res) =>
      res.json({ items: [], nextCursor: null }),
    );
    routes.get("/internal/catalog/class-times", (req, res) =>
      res.json({ items: [] }),
    );
    return createApp({ service: "test", logger, routes, spec, auth });
  }

  const as = async (role) => `Bearer ${await keys.signToken({ role })}`;

  it("lets anyone call a public operation", async () => {
    const res = await request(app())
      .post("/auth/codes")
      .send({ email: "guest@example.com" });
    expect(res.status).toBe(202);
  });

  it("needs a token where the spec lists roles", async () => {
    const res = await request(app()).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("allows only the roles in x-roles", async () => {
    const guest = await request(app())
      .get("/auth/me")
      .set("authorization", await as("guest"));
    expect(guest.status).toBe(403);

    const tourist = await request(app())
      .get("/auth/me")
      .set("authorization", await as("tourist"));
    expect(tourist.status).toBe(200);
    expect(tourist.body.role).toBe("tourist");

    const touristOnAdmin = await request(app())
      .get("/auth/users")
      .set("authorization", await as("tourist"));
    expect(touristOnAdmin.status).toBe(403);

    const admin = await request(app())
      .get("/auth/users")
      .set("authorization", await as("admin"));
    expect(admin.status).toBe(200);
  });

  it("needs the internal token on /internal paths, never a user token", async () => {
    const path = `/internal/catalog/class-times?classId=${CLASS_ID}`;

    const userToken = await request(app())
      .get(path)
      .set("authorization", await as("admin"));
    expect(userToken.status).toBe(401);

    const internal = await request(app())
      .get(path)
      .set("x-internal-token", INTERNAL_TOKEN);
    expect(internal.status).toBe(200);
  });

  it("refuses everything that needs a sign-in when no keys are set up", async () => {
    const noAuth = app({});

    const me = await request(noAuth)
      .get("/auth/me")
      .set("authorization", await as("tourist"));
    expect(me.status).toBe(401);

    const internal = await request(noAuth)
      .get(`/internal/catalog/class-times?classId=${CLASS_ID}`)
      .set("x-internal-token", INTERNAL_TOKEN);
    expect(internal.status).toBe(401);
  });
});
