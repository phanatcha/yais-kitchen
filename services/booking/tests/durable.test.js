import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createStore } from "../src/models/store.js";
import { harness } from "./helpers.js";

describe("persistent inbox and transactional outbox", () => {
  let h;
  beforeAll(async () => {
    h = await harness(createStore);
  }, 120000);
  afterAll(async () => h?.close());
  beforeEach(async () => h.clear());
  it("rolls back business writes and events together", async () => {
    await expect(
      h.durable.transaction(async (session) => {
        await h.store.Allocation.create([{ _id: "rollback", revision: 1 }], {
          session,
        });
        await h.durable.enqueue(session, "booking.confirmed", {
          bookingId: "rollback",
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await h.store.Allocation.countDocuments()).toBe(0);
    expect(await h.connection.collection("outbox").countDocuments()).toBe(0);
  });
  it("retains an event after publication failure and preserves its ID on retry", async () => {
    await h.durable.transaction((session) =>
      h.durable.enqueue(session, "test.event", { value: 1 }),
    );
    const ids = [];
    await expect(
      h.durable.flush({
        publish: async (type, data, options) => {
          ids.push(options.id);
          throw new Error("broker down");
        },
      }),
    ).rejects.toThrow("broker down");
    expect(await h.connection.collection("outbox").countDocuments()).toBe(1);
    await h.durable.flush({
      publish: async (type, data, options) => ids.push(options.id),
    });
    expect(ids[0]).toBe(ids[1]);
    expect(await h.connection.collection("outbox").countDocuments()).toBe(0);
  });
  it("deduplicates a committed inbox delivery across handler restarts", async () => {
    const event = { id: randomUUID() };
    let calls = 0;
    await h.durable.receive(event, async () => {
      calls++;
    });
    await h.durable.receive(event, async () => {
      calls++;
    });
    expect(calls).toBe(1);
  });
  it("does not mark failed delivery processed", async () => {
    const event = { id: randomUUID() };
    await expect(
      h.durable.receive(event, async () => {
        throw new Error("recoverable");
      }),
    ).rejects.toThrow("recoverable");
    expect(await h.connection.collection("inbox").countDocuments()).toBe(0);
    await h.durable.receive(event, async () => {});
    expect(await h.connection.collection("inbox").countDocuments()).toBe(1);
  });
});
