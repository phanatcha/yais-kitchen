import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { auditEntry, auditTrail, redact } from "../src/audit.js";
import { createLogger } from "../src/logger.js";

const logger = createLogger({ service: "test", level: "silent" });

function appWith(record, user) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    req.openapi = {
      schema: { operationId: "updateThing" },
      pathParams: { thingId: "abc" },
    };
    next();
  });
  app.use(auditTrail({ service: "catalog", record, logger }));
  app.all("/things/abc", (req, res) =>
    res.status(req.get("x-status") ? Number(req.get("x-status")) : 200).end(),
  );
  return app;
}

const admin = { id: "6650a1f2c3d4e5f6a7b8c9d0", role: "admin", name: "Pim" };

describe("the audit trail", () => {
  it("records a staff member's change once the answer has gone out", async () => {
    const record = vi.fn(async () => {});
    await request(appWith(record, admin))
      .patch("/things/abc?x=1")
      .send({ status: "cancelled", code: "123456" });

    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(record.mock.calls[0][0]).toMatchObject({
      service: "catalog",
      action: "updateThing",
      method: "PATCH",
      path: "/things/abc",
      target: { thingId: "abc" },
      status: 200,
      actor: { id: admin.id, role: "admin", name: "Pim" },
      changes: { status: "cancelled", code: "[hidden]" },
    });
  });

  it("leaves out reads, failures, tourists and calls without a person", async () => {
    const record = vi.fn(async () => {});
    await request(appWith(record, admin)).get("/things/abc");
    await request(appWith(record, admin))
      .delete("/things/abc")
      .set("x-status", "409");
    await request(appWith(record, { id: "t", role: "tourist" })).post(
      "/things/abc",
    );
    await request(appWith(record, undefined)).post("/things/abc");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record).not.toHaveBeenCalled();
  });

  it("never fails the request when recording fails", async () => {
    const record = vi.fn(async () => {
      throw new Error("outbox is down");
    });
    const res = await request(appWith(record, admin)).put("/things/abc");
    expect(res.status).toBe(200);
  });
});

describe("what an entry keeps", () => {
  it("hides secrets and cuts long values short", () => {
    const kept = redact({
      accessToken: "x",
      cardNumber: "4242",
      notes: "a".repeat(400),
      steps: Array.from({ length: 25 }, (_, i) => i),
      deep: { a: { b: { c: { d: 1 } } } },
    });
    expect(kept.accessToken).toBe("[hidden]");
    expect(kept.cardNumber).toBe("[hidden]");
    expect(kept.notes).toHaveLength(301);
    expect(kept.steps).toHaveLength(21);
    expect(kept.steps.at(-1)).toBe("…5 more");
    expect(kept.deep.a.b.c).toBe("…");
  });

  it("keeps only the field names of a big body", () => {
    const req = {
      method: "PUT",
      originalUrl: "/catalog/classes/1/recipe",
      user: admin,
      body: {
        steps: Array.from({ length: 20 }, () => ({ text: "x".repeat(300) })),
      },
    };
    const entry = auditEntry(req, { statusCode: 200 }, "catalog");
    expect(entry.changes).toEqual({ fields: ["steps"] });
    expect(entry.action).toBe("PUT ");
  });
});
