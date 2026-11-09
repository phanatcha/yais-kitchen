import { describe, expect, it } from "vitest";
import {
  createEventChecker,
  EventSpecError,
  loadEventSpec,
} from "../src/event-spec.js";

const envelope = {
  id: "3f0c2a52-7d7a-4d43-9a3f-6a1b2c3d4e5f",
  occurredAt: "2026-11-20T09:00:00Z",
  version: 1,
};

describe("createEventChecker", () => {
  const checkEvent = createEventChecker();

  it("knows every message in asyncapi.yaml", () => {
    const spec = loadEventSpec();
    const types = Object.values(spec.components.messages).map(
      (message) => message.name,
    );
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect(checkEvent.knows(type)).toBe(true);
    for (const channel of Object.values(spec.channels)) {
      expect(checkEvent.knows(channel.address)).toBe(true);
    }
  });

  it("accepts an event that matches", () => {
    expect(() =>
      checkEvent({
        ...envelope,
        type: "application.received",
        data: {
          applicationId: "6650a1f2c3d4e5f6a7b8c9d0",
          yaiName: "Yai Malai",
          contactName: "Alex",
          email: "guest@example.com",
          extra: "fields are allowed, so adding one keeps the version",
        },
      }),
    ).not.toThrow();
  });

  it("lists every problem by field, never by value", () => {
    let error;
    try {
      checkEvent({
        ...envelope,
        type: "auth.code_requested",
        data: { email: "not-an-email", code: "12" },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(EventSpecError);
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual(
      expect.arrayContaining([
        { field: "data", message: "must have required property 'expiresAt'" },
        { field: "data.email", message: 'must match format "email"' },
        { field: "data.code", message: 'must match pattern "^[0-9]{6}$"' },
      ]),
    );
    expect(error.message).not.toContain("not-an-email");
  });

  it("checks the envelope too", () => {
    expect(() =>
      checkEvent({
        ...envelope,
        id: "not-a-uuid",
        type: "user.deleted",
        data: { userId: "6650a1f2c3d4e5f6a7b8c9d0" },
      }),
    ).toThrow('id must match format "uuid"');
  });

  it("refuses a type the spec doesn't have", () => {
    expect(() =>
      checkEvent({ ...envelope, type: "booking.lost", data: {} }),
    ).toThrow(EventSpecError);
    expect(checkEvent.knows("booking.lost")).toBe(false);
  });
});
