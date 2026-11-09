import { describe, expect, it, vi } from "vitest";
import { badRequest } from "../src/errors.js";
import { createEventChecker, EventSpecError } from "../src/event-spec.js";
import {
  connectEvents,
  createDeliveryHandler,
  DEAD_LETTER_QUEUE,
  EXCHANGE,
  retryQueueFor,
} from "../src/events.js";
import { logContext } from "../src/logger.js";
import {
  captureLogs,
  FakeChannel,
  fakeBroker,
  makeEvent,
  makeMessage,
} from "./helpers.js";

function deliveryHandler(handlers, options = {}) {
  const channel = new FakeChannel();
  const { lines, logger } = captureLogs();
  const onMessage = createDeliveryHandler({
    channel,
    queue: "notification",
    handlers,
    logger,
    retryDelayMs: 5000,
    ...options,
  });
  return { channel, lines, onMessage };
}

const headersOf = (sent) => sent.options.headers;

describe("handling one event", () => {
  it("acks after the handler works", async () => {
    const handler = vi.fn();
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": handler,
    });
    const event = makeEvent();
    const message = makeMessage(event);

    await onMessage(message);

    expect(handler).toHaveBeenCalledWith(event, { attempt: 1 });
    expect(channel.acked).toEqual([message]);
    expect(channel.sent).toEqual([]);
  });

  it("runs the handler with the event and request IDs on every log line", async () => {
    let seen;
    const { onMessage } = deliveryHandler({
      "booking.confirmed": () => {
        seen = logContext.getStore();
      },
    });
    const event = makeEvent();

    await onMessage(makeMessage(event, { "x-request-id": "req_abc12345" }));

    expect(seen).toEqual({
      eventId: event.id,
      eventType: "booking.confirmed",
      requestId: "req_abc12345",
    });
  });

  it("sends a failed event to the retry queue, waiting longer each time", async () => {
    const { channel, lines, onMessage } = deliveryHandler({
      "booking.confirmed": () => {
        throw new Error("SMTP is down");
      },
    });
    const event = makeEvent();

    for (const attempt of [1, 2, 3, 4]) {
      await onMessage(
        makeMessage(event, {
          "x-attempts": attempt,
          "x-request-id": "req_abc12345",
        }),
      );
    }

    expect(channel.sent.map((sent) => sent.queue)).toEqual(
      Array(4).fill(retryQueueFor("notification")),
    );
    expect(channel.sent.map((sent) => sent.options.expiration)).toEqual([
      "5000",
      "10000",
      "20000",
      "40000",
    ]);
    expect(channel.sent.map((sent) => headersOf(sent)["x-attempts"])).toEqual([
      2, 3, 4, 5,
    ]);
    expect(headersOf(channel.sent[0])["x-request-id"]).toBe("req_abc12345");
    expect(channel.sent[0].options).toMatchObject({
      persistent: true,
      messageId: event.id,
    });
    expect(channel.acked).toHaveLength(4);
    expect(lines.filter((line) => line.level === "warn")[0]).toMatchObject({
      eventId: event.id,
      attempt: 1,
      retryInMs: 5000,
    });
  });

  it("never waits more than a minute between tries", async () => {
    const { channel, onMessage } = deliveryHandler(
      { "booking.confirmed": () => Promise.reject(new Error("nope")) },
      { retryDelayMs: 20_000 },
    );
    await onMessage(makeMessage(makeEvent(), { "x-attempts": 3 }));
    expect(channel.sent[0].options.expiration).toBe("60000");
  });

  it("moves the event to the dead-letter queue after the 5th failure", async () => {
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": () => {
        throw new Error("SMTP is down");
      },
    });
    const message = makeMessage(makeEvent(), { "x-attempts": 5 });

    await onMessage(message);

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].queue).toBe(DEAD_LETTER_QUEUE);
    expect(channel.sent[0].options.expiration).toBeUndefined();
    expect(headersOf(channel.sent[0])).toMatchObject({
      "x-attempts": 5,
      "x-failed-queue": "notification",
      "x-error": "SMTP is down",
    });
    expect(channel.acked).toEqual([message]);
  });

  it("moves an event straight to the dead-letter queue when trying again won't help", async () => {
    const handler = vi.fn(() => {
      throw badRequest("This booking has no email.");
    });
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": handler,
    });
    const message = makeMessage(makeEvent());

    await onMessage(message);

    expect(handler).toHaveBeenCalledOnce();
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].queue).toBe(DEAD_LETTER_QUEUE);
    expect(headersOf(channel.sent[0])).toMatchObject({
      "x-attempts": 1,
      "x-error": "This booking has no email.",
    });
    expect(channel.acked).toEqual([message]);
  });

  it("dead-letters an event that doesn't match asyncapi.yaml without handling it", async () => {
    const handler = vi.fn();
    const { channel, onMessage } = deliveryHandler(
      { "booking.confirmed": handler },
      { checkEvent: createEventChecker() },
    );

    await onMessage(
      makeMessage(makeEvent("booking.confirmed", { bookingId: "b1" })),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(channel.sent[0].queue).toBe(DEAD_LETTER_QUEUE);
    expect(headersOf(channel.sent[0])["x-error"]).toContain(
      "data must have required property 'email'",
    );
  });

  it("moves a message that isn't an event straight to the dead-letter queue", async () => {
    const handler = vi.fn();
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": handler,
    });

    await onMessage(makeMessage("{ not json"));
    await onMessage(makeMessage({ id: "x", type: "booking.confirmed" }));

    expect(handler).not.toHaveBeenCalled();
    expect(channel.sent.map((sent) => sent.queue)).toEqual([
      DEAD_LETTER_QUEUE,
      DEAD_LETTER_QUEUE,
    ]);
    expect(channel.acked).toHaveLength(2);
  });

  it("skips an event type it has no handler for", async () => {
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": vi.fn(),
    });
    await onMessage(makeMessage(makeEvent("booking.cancelled")));

    expect(channel.sent).toEqual([]);
    expect(channel.acked).toHaveLength(1);
  });

  it("puts the event back if the broker won't take the retry", async () => {
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": () => {
        throw new Error("SMTP is down");
      },
    });
    channel.failSends = true;
    const message = makeMessage(makeEvent());

    await onMessage(message);

    expect(channel.acked).toEqual([]);
    expect(channel.nacked).toEqual([{ message, requeue: true }]);
  });

  it("survives acking on a closed channel, because the broker sends it again", async () => {
    const { channel, onMessage } = deliveryHandler({
      "booking.confirmed": vi.fn(),
    });
    channel.closed = true;
    await expect(onMessage(makeMessage(makeEvent()))).resolves.toBeUndefined();
  });
});

describe("connectEvents", () => {
  async function connect(options = {}) {
    const broker = fakeBroker();
    const { lines, logger } = captureLogs();
    const events = await connectEvents({
      url: "amqp://user:secret@localhost:5672",
      service: "notification",
      logger,
      connect: broker.connect,
      // Most tests here are about delivery, so they skip asyncapi.yaml.
      eventSpec: null,
      ...options,
    });
    return { broker, events, lines };
  }

  it("sets up the exchange, the dead-letter queue and a reconnecting connection", async () => {
    const { broker, events } = await connect();

    expect(broker.channel.exchanges).toEqual([
      { name: EXCHANGE, type: "topic", options: { durable: true } },
    ]);
    expect(broker.channel.queues.get(DEAD_LETTER_QUEUE)).toEqual({
      durable: true,
    });
    expect(broker.options.recovery).toMatchObject({
      initialMaxRetries: 5,
      maxRetries: Infinity,
    });
    expect(broker.options.clientProperties).toEqual({
      connection_name: "notification",
    });
    expect(events.isReady()).toBe(true);
  });

  it("publishes the envelope with the request ID, and waits for the broker", async () => {
    const { broker, events } = await connect();

    const event = await logContext.run({ requestId: "req_abc12345" }, () =>
      events.publish("auth.code_requested", { email: "guest@example.com" }),
    );

    expect(event).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: "auth.code_requested",
      occurredAt: expect.any(String),
      version: 1,
      data: { email: "guest@example.com" },
    });
    const [published] = broker.channel.published;
    expect(published).toMatchObject({
      exchange: EXCHANGE,
      routingKey: "auth.code_requested",
    });
    expect(JSON.parse(published.content)).toEqual(event);
    expect(published.options).toMatchObject({
      persistent: true,
      mandatory: true,
      messageId: event.id,
      type: "auth.code_requested",
      headers: { "x-request-id": "req_abc12345" },
    });
  });

  it("refuses names that aren't event types", async () => {
    const { events } = await connect();
    await expect(events.publish("Booking Confirmed", {})).rejects.toThrow(
      TypeError,
    );
  });

  it("answers 503 when the broker can't take the event", async () => {
    const { broker, events } = await connect();
    broker.channel.failSends = true;
    await expect(events.publish("booking.confirmed", {})).rejects.toMatchObject(
      {
        status: 503,
        retryable: true,
      },
    );

    broker.connection.emit("disconnect", new Error("gone"));
    expect(events.isReady()).toBe(false);
    await expect(events.publish("booking.confirmed", {})).rejects.toMatchObject(
      { status: 503 },
    );
  });

  it("binds the service's queue to each handled type and takes events from it", async () => {
    const { broker, events } = await connect();
    const handler = vi.fn();
    await events.consume({
      "booking.confirmed": handler,
      "booking.cancelled": handler,
    });

    const channel = broker.channel;
    expect(channel.queues.get("notification")).toEqual({ durable: true });
    expect(channel.queues.get("notification.retry")).toEqual({
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": "notification",
      },
    });
    expect(channel.bindings.map((binding) => binding.key)).toEqual([
      "booking.confirmed",
      "booking.cancelled",
    ]);

    channel.consumers.get("notification")(makeMessage(makeEvent()));
    await vi.waitFor(() => expect(channel.acked).toHaveLength(1));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("takes all handlers in one call", async () => {
    const { events } = await connect();
    await events.consume({ "booking.confirmed": vi.fn() });
    await expect(
      events.consume({ "booking.cancelled": vi.fn() }),
    ).rejects.toThrow(/one call/);
  });

  it("sets everything up again after reconnecting", async () => {
    const { broker, events } = await connect();
    await events.consume({ "booking.confirmed": vi.fn() });
    const before = broker.channel;

    await broker.reconnect();

    expect(broker.channel).not.toBe(before);
    expect(broker.channel.consumers.has("notification")).toBe(true);
    expect(events.isReady()).toBe(true);
  });

  it("calls onFatal when the broker closes the channel", async () => {
    const onFatal = vi.fn();
    const { broker, lines } = await connect({ onFatal });

    broker.channel.emit("error", new Error("PRECONDITION_FAILED"));

    expect(onFatal).toHaveBeenCalledOnce();
    expect(lines.at(-1)).toMatchObject({ level: "fatal" });
  });

  it("finishes the events in hand before it disconnects", async () => {
    const { broker, events } = await connect();
    let finish;
    await events.consume({
      "booking.confirmed": () => new Promise((resolve) => (finish = resolve)),
    });
    broker.channel.consumers.get("notification")(makeMessage(makeEvent()));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));

    const closed = events.close();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(broker.connection.closed).toBeUndefined();

    finish();
    await closed;
    expect(broker.channel.cancelled).toEqual(["tag-notification"]);
    expect(broker.channel.acked).toHaveLength(1);
    expect(broker.connection.closed).toBe(true);
    expect(events.isReady()).toBe(false);
  });

  it("checks published events against asyncapi.yaml, so a sender's bug never leaves it", async () => {
    const { broker, events } = await connect({ eventSpec: undefined });

    const error = await events
      .publish("auth.code_requested", { email: "guest@example.com", code: "1" })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(EventSpecError);
    expect(error.message).toContain("data.code must match pattern");
    expect(error.message).not.toContain('"1"');
    expect(broker.channel.published).toEqual([]);

    await events.publish("auth.code_requested", {
      email: "guest@example.com",
      code: "482913",
      expiresAt: "2026-11-20T09:10:00Z",
    });
    expect(broker.channel.published).toHaveLength(1);
  });

  it("refuses to consume a type that isn't in asyncapi.yaml", async () => {
    const { events } = await connect({ eventSpec: undefined });
    await expect(
      events.consume({ "booking.confrimed": vi.fn() }),
    ).rejects.toThrow("isn't an event in asyncapi.yaml");
  });

  it("never logs the broker URL, which holds a password", async () => {
    const { lines } = await connect();
    expect(JSON.stringify(lines)).not.toContain("secret");
  });
});
