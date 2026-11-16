import { createHash } from "node:crypto";
import { redact } from "./audit.js";
import { conflict, notFound } from "./errors.js";

// A person reads at most this many failed events at once, and a retry looks
// at most this far down the queue for the one asked for.
export const MAX_LISTED = 200;
const MAX_SEARCHED = 5000;

// Headers the delivery handler adds on the way to the dead-letter queue. A
// retried event leaves them behind and starts again from its first try.
const DEAD_HEADERS = ["x-attempts", "x-error", "x-failed-queue", "x-dead-at"];

function parse(content) {
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * The same message always gets the same ID, so a person can pick it from a
 * list and act on it later. Two copies of one event that failed in two
 * services have different IDs, because each goes back to its own queue.
 */
export function failedEventId(message) {
  const queue = message.properties.headers?.["x-failed-queue"] ?? "";
  return createHash("sha256")
    .update(queue)
    .update("\n")
    .update(String(message.properties.messageId ?? ""))
    .update("\n")
    .update(message.content)
    .digest("hex")
    .slice(0, 32);
}

/** A failed event as a person sees it. Secrets in `data` are hidden. */
export function viewFailedEvent(message) {
  const headers = message.properties.headers ?? {};
  const event = parse(message.content);
  const attempts = headers["x-attempts"];
  return {
    id: failedEventId(message),
    eventId: event?.id ?? message.properties.messageId ?? null,
    type: event?.type ?? message.properties.type ?? null,
    queue: headers["x-failed-queue"] ?? null,
    error: String(headers["x-error"] ?? "unknown error").slice(0, 500),
    attempts: Number.isInteger(attempts) ? attempts : null,
    occurredAt: event?.occurredAt ?? null,
    failedAt: headers["x-dead-at"] ?? null,
    data:
      event && typeof event.data === "object" && event.data !== null
        ? redact(event.data)
        : null,
  };
}

/**
 * Reads, retries and throws away the events in the dead-letter queue. Each call
 * opens its own channel and closes it at the end, which puts back every
 * message it looked at and didn't settle, in the same order.
 * @param {() => Promise<object>} openChannel Opens an amqplib confirm channel.
 * @param {string} queue The dead-letter queue.
 */
export function createDeadLetters(openChannel, queue) {
  async function withChannel(work) {
    const channel = await openChannel();
    try {
      return await work(channel);
    } finally {
      await channel.close().catch(() => {});
    }
  }

  /** Takes messages off the queue until it reaches the one with this ID. */
  async function find(channel, id) {
    for (let i = 0; i < MAX_SEARCHED; i += 1) {
      const message = await channel.get(queue, { noAck: false });
      if (!message) return null;
      if (failedEventId(message) === id) return message;
    }
    return null;
  }

  return {
    /** The oldest failed events first, and how many are waiting in all. */
    list({ limit = 50 } = {}) {
      return withChannel(async (channel) => {
        const { messageCount } = await channel.checkQueue(queue);
        const items = [];
        while (items.length < Math.min(limit, MAX_LISTED)) {
          const message = await channel.get(queue, { noAck: false });
          if (!message) break;
          items.push(viewFailedEvent(message));
        }
        return { items, total: messageCount };
      });
    },

    /**
     * Sends one failed event back to the queue it failed in, as if it were
     * new, and takes it off the dead-letter queue once the broker has it.
     */
    retry(id) {
      return withChannel(async (channel) => {
        const message = await find(channel, id);
        if (!message)
          throw notFound("That failed event isn't waiting any more.");
        const headers = { ...message.properties.headers };
        const failedIn = headers["x-failed-queue"];
        if (!failedIn) {
          throw conflict(
            "no_queue",
            "This event doesn't say where it failed, so it can't be sent again.",
          );
        }
        for (const name of DEAD_HEADERS) delete headers[name];
        headers["x-retried-at"] = new Date().toISOString();
        await new Promise((resolve, reject) =>
          channel.sendToQueue(
            failedIn,
            message.content,
            {
              persistent: true,
              contentType: message.properties.contentType,
              messageId: message.properties.messageId,
              type: message.properties.type,
              timestamp: message.properties.timestamp,
              headers,
            },
            (error) => (error ? reject(error) : resolve()),
          ),
        );
        channel.ack(message);
        return viewFailedEvent(message);
      });
    },

    /** Throws one failed event away for good. */
    discard(id) {
      return withChannel(async (channel) => {
        const message = await find(channel, id);
        if (!message)
          throw notFound("That failed event isn't waiting any more.");
        channel.ack(message);
        return viewFailedEvent(message);
      });
    },
  };
}
