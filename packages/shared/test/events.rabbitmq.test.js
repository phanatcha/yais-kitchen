// Runs against a real RabbitMQ only when RABBITMQ_URL is set, for example:
//   docker run --rm -d --name yk-rabbit --user rabbitmq -p 127.0.0.1:5672:5672 rabbitmq:4-alpine
//   RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672 npm test
import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  connectEvents,
  DEAD_LETTER_QUEUE,
  retryQueueFor,
} from "../src/events.js";
import { logContext } from "../src/logger.js";
import { captureLogs } from "./helpers.js";

const url = process.env.RABBITMQ_URL;

describe.skipIf(!url)("events through a real RabbitMQ", () => {
  const opened = [];
  const queues = [];

  afterAll(async () => {
    for (const events of opened) await events.close();
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    for (const queue of queues) {
      await channel.deleteQueue(queue);
      await channel.deleteQueue(retryQueueFor(queue));
    }
    await connection.close();
  });

  // Each test gets its own service name, so its own queue.
  async function connect() {
    const service = `test-${randomUUID().slice(0, 8)}`;
    queues.push(service);
    const { logger } = captureLogs();
    const events = await connectEvents({
      url,
      service,
      logger,
      retryDelayMs: 20,
    });
    opened.push(events);
    return { events, service };
  }

  // The dead-letter queue is shared, so take only our own message from it.
  // Messages left unacked go back to the queue when the connection closes.
  async function takeFromDeadLetters(messageId) {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    try {
      for (;;) {
        const message = await channel.get(DEAD_LETTER_QUEUE);
        if (!message) return null;
        if (message.properties.messageId === messageId) {
          channel.ack(message);
          return message;
        }
      }
    } finally {
      await connection.close();
    }
  }

  it("delivers an event once, with the request ID it was sent with", async () => {
    const { events } = await connect();
    const received = [];
    await events.consume({
      "test.happened": async (event, { attempt }) => {
        received.push({ event, attempt, context: logContext.getStore() });
      },
    });

    const event = await logContext.run({ requestId: "req_test_123" }, () =>
      events.publish("test.happened", { n: 1 }),
    );

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({
      event,
      attempt: 1,
      context: {
        eventId: event.id,
        eventType: "test.happened",
        requestId: "req_test_123",
      },
    });
  });

  it("retries a failing event 5 times, then dead-letters it", async () => {
    const { events, service } = await connect();
    const attempts = [];
    await events.consume({
      "test.happened": async (event, { attempt }) => {
        attempts.push(attempt);
        throw new Error("still broken");
      },
    });

    const event = await events.publish("test.happened", { n: 2 });

    await vi.waitFor(() => expect(attempts).toEqual([1, 2, 3, 4, 5]), {
      timeout: 5000,
    });
    let dead;
    await vi.waitFor(
      async () => {
        dead = await takeFromDeadLetters(event.id);
        expect(dead).not.toBeNull();
      },
      { timeout: 5000 },
    );
    expect(JSON.parse(dead.content)).toEqual(event);
    expect(dead.properties.headers).toMatchObject({
      "x-attempts": 5,
      "x-failed-queue": service,
      "x-error": "still broken",
    });
  });
});
