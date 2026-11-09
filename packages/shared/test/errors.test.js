import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  conflict,
  HttpError,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  toHttpError,
} from "../src/errors.js";
import { createApp } from "../src/service.js";
import { loadApiSpec } from "../src/spec.js";
import { captureLogs } from "./helpers.js";

const spec = loadApiSpec();

// POST /auth/codes is public in the spec, so these tests need no token.
function appThatThrows(error, options = {}) {
  const { lines, logger } = captureLogs();
  const routes = express.Router();
  routes.post("/auth/codes", () => {
    throw error;
  });
  const app = createApp({ service: "test", logger, routes, spec, ...options });
  return { app, lines };
}

const send = (app, body = { email: "guest@example.com" }) =>
  request(app).post("/auth/codes").send(body);

describe("error responses", () => {
  it("use the spec's Error shape with the request ID", async () => {
    const { app } = appThatThrows(
      conflict("not_enough_seats", "Only 1 seat is left."),
    );
    const res = await send(app);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: "not_enough_seats",
        message: "Only 1 seat is left.",
        requestId: res.headers["x-request-id"],
        retryable: false,
      },
    });
  });

  it("send Retry-After with 429", async () => {
    const { app } = appThatThrows(tooManyRequests(120));
    const res = await send(app);

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
    expect(res.body.error).toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
  });

  it("hide unexpected errors and log them with the stack", async () => {
    const { app, lines } = appThatThrows(
      new Error("mongo password is hunter2"),
    );
    const res = await send(app);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: "internal_error",
      retryable: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|at |stack/);

    const logged = lines.find((line) => line.msg === "request failed");
    expect(logged.requestId).toBe(res.headers["x-request-id"]);
    expect(logged.err.stack).toContain("mongo password");
  });

  it("explain bodies that aren't JSON", async () => {
    const { app } = appThatThrows(notFound());
    const res = await request(app)
      .post("/auth/codes")
      .set("content-type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });

  it("refuse bodies over the limit", async () => {
    const { app } = appThatThrows(notFound(), { bodyLimit: "1kb" });
    const res = await send(app, { email: `${"a".repeat(2000)}@example.com` });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });

  it("list every field that doesn't match the spec", async () => {
    const { app } = appThatThrows(notFound());
    const res = await send(app, { email: "not-an-email", extra: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { field: "email", message: expect.any(String) },
        { field: "extra", message: expect.any(String) },
      ]),
    );
  });

  it("answer 404 for paths the spec doesn't have and 405 for wrong methods", async () => {
    const { app } = appThatThrows(notFound());

    const missing = await request(app).get("/nowhere");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");

    const wrongMethod = await request(app).delete("/auth/codes");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.body.error.code).toBe("method_not_allowed");
  });
});

describe("toHttpError", () => {
  it("keeps HttpErrors as they are", () => {
    const error = serviceUnavailable();
    expect(toHttpError(error)).toBe(error);
    expect(error).toMatchObject({ status: 503, retryable: true });
  });

  it("treats a response that breaks the spec as an internal error", () => {
    const fromValidator = Object.assign(new Error("/response/id is required"), {
      status: 500,
      errors: [{ path: "/response/id", message: "is required" }],
    });
    expect(toHttpError(fromValidator)).toMatchObject({
      status: 500,
      code: "internal_error",
    });
  });

  it("names nested fields with dots", () => {
    const fromValidator = Object.assign(new Error("bad"), {
      status: 400,
      errors: [
        { path: "/body/guests/0/name", message: "is too long" },
        { path: "/query/limit", message: "must be <= 50" },
        { path: "/body", message: "must be object" },
      ],
    });
    expect(toHttpError(fromValidator).details).toEqual([
      { field: "guests.0.name", message: "is too long" },
      { field: "limit", message: "must be <= 50" },
      { field: "body", message: "must be object" },
    ]);
  });

  it("makes anything else a 500", () => {
    expect(toHttpError("a string")).toBeInstanceOf(HttpError);
    expect(toHttpError(undefined).status).toBe(500);
  });
});
