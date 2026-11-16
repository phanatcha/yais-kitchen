import { describe, expect, it } from "vitest";
import { createDeadLetters, failedEventId } from "../src/dead-letters.js";

const QUEUE = "yais.events.dead";

/**
 * A dead-letter queue in memory that behaves like RabbitMQ: a message taken
 * with `get` and not acked goes back, in its place, when the channel closes.
 */
function fakeBroker(messages) {
  const broker = { queue: [...messages], sent: [], channels: 0 };
  broker.open = async () => {
    broker.channels += 1;
    const taken = [];
    return {
      async checkQueue() {
        return { messageCount: broker.queue.length + taken.length };
      },
      async get(queue) {
        expect(queue).toBe(QUEUE);
        const message = broker.queue.shift();
        if (!message) return false;
        taken.push(message);
        return message;
      },
      ack(message) {
        taken.splice(taken.indexOf(message), 1);
      },
      sendToQueue(queue, content, options, done) {
        broker.sent.push({ queue, content, options });
        done(null);
      },
      async close() {
        broker.queue.unshift(...taken.splice(0));
      },
    };
  };
  return broker;
}

function deadMessage(type, queue, data = {}) {
  const event = {
    id: crypto.randomUUID(),
    type,
    occurredAt: "2026-11-16T09:00:00.000Z",
    version: 1,
    data,
  };
  return {
    content: Buffer.from(JSON.stringify(event)),
    properties: {
      messageId: event.id,
      type,
      contentType: "application/json",
      headers: {
        "x-request-id": "req_12345678",
        "x-attempts": 5,
        "x-failed-queue": queue,
        "x-error": "Auth answered 503.",
        "x-dead-at": "2026-11-16T09:03:00.000Z",
      },
    },
    event,
  };
}

describe("failed events", () => {
  const code = deadMessage("auth.code_requested", "notification", {
    email: "guest@example.com",
    code: "482913",
  });
  const booked = deadMessage("booking.confirmed", "notification", {
    bookingId: "6650a1f2c3d4e5f6a7b8c9e1",
  });

  it("lists them oldest first, hides secrets, and leaves them waiting", async () => {
    const broker = fakeBroker([code, booked]);
    const dead = createDeadLetters(broker.open, QUEUE);

    const { items, total } = await dead.list();

    expect(total).toBe(2);
    expect(items.map((item) => item.type)).toEqual([
      "auth.code_requested",
      "booking.confirmed",
    ]);
    expect(items[0]).toMatchObject({
      id: failedEventId(code),
      eventId: code.event.id,
      queue: "notification",
      error: "Auth answered 503.",
      attempts: 5,
      failedAt: "2026-11-16T09:03:00.000Z",
      data: { email: "guest@example.com", code: "[hidden]" },
    });
    expect(broker.queue).toEqual([code, booked]);
  });

  it("sends one back to the queue it failed in, as a first try", async () => {
    const broker = fakeBroker([code, booked]);
    const dead = createDeadLetters(broker.open, QUEUE);

    const retried = await dead.retry(failedEventId(booked));

    expect(retried.eventId).toBe(booked.event.id);
    expect(broker.sent).toHaveLength(1);
    const [sent] = broker.sent;
    expect(sent.queue).toBe("notification");
    expect(sent.content).toBe(booked.content);
    expect(sent.options.messageId).toBe(booked.event.id);
    expect(sent.options.headers).toEqual({
      "x-request-id": "req_12345678",
      "x-retried-at": expect.any(String),
    });
    expect(broker.queue).toEqual([code]);
  });

  it("throws one away, and says when one isn't waiting any more", async () => {
    const broker = fakeBroker([code, booked]);
    const dead = createDeadLetters(broker.open, QUEUE);

    await dead.discard(failedEventId(code));
    expect(broker.queue).toEqual([booked]);
    expect(broker.sent).toEqual([]);

    await expect(dead.retry(failedEventId(code))).rejects.toMatchObject({
      status: 404,
    });
    expect(broker.queue).toEqual([booked]);
  });

  it("won't resend an event that doesn't say where it failed", async () => {
    const lost = deadMessage("booking.confirmed", undefined);
    delete lost.properties.headers["x-failed-queue"];
    const broker = fakeBroker([lost]);
    const dead = createDeadLetters(broker.open, QUEUE);

    await expect(dead.retry(failedEventId(lost))).rejects.toMatchObject({
      status: 409,
      code: "no_queue",
    });
    expect(broker.queue).toEqual([lost]);
  });
});
