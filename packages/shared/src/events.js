import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import { serviceUnavailable } from "./errors.js";
import { createEventChecker, loadEventSpec } from "./event-spec.js";
import { logContext } from "./logger.js";

// The rules in packages/api-spec/asyncapi.yaml: one topic exchange, the event
// type as the routing key, one queue per service, at-least-once delivery, and
// the dead-letter queue after 5 failed tries.
export const EXCHANGE = "yais.events";
export const DEAD_LETTER_QUEUE = "yais.events.dead";
export const MAX_ATTEMPTS = 5;

const EVENT_TYPE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;
const MAX_RETRY_DELAY_MS = 60_000;

// Failed events wait here, then RabbitMQ sends them back to the main queue.
// The wait is set on each message, so changing it never conflicts with a
// queue that already exists.
export const retryQueueFor = (queue) => `${queue}.retry`;

// Resolves once the broker has the message, so it is never lost in between.
const confirmed = (send) =>
  new Promise((resolve, reject) => {
    send((error) => (error ? reject(error) : resolve()));
  });

function parseEvent(content) {
  try {
    const event = JSON.parse(content.toString("utf8"));
    const valid =
      typeof event?.id === "string" &&
      typeof event.type === "string" &&
      typeof event.occurredAt === "string" &&
      Number.isInteger(event.version) &&
      typeof event.data === "object" &&
      event.data !== null;
    return valid ? event : null;
  } catch {
    return null;
  }
}

/**
 * Handles one message from a queue. The handler for its type runs, and then:
 * - it worked: the message is acked;
 * - it threw: the message goes to the retry queue and comes back later,
 *   waiting `retryDelayMs`, then twice as long each time, up to a minute;
 * - it threw on the last attempt, it threw an error with `retryable: false`
 *   (any 4xx HttpError), the event doesn't match asyncapi.yaml, or the
 *   message isn't an event: the message goes to the dead-letter queue for a
 *   person to look at.
 * A message is only acked after the broker has its next copy.
 */
export function createDeliveryHandler({
  channel,
  queue,
  handlers,
  logger,
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs,
  checkEvent,
}) {
  const sendTo = (target, message, headers, extra = {}) =>
    confirmed((done) =>
      channel.sendToQueue(
        target,
        message.content,
        {
          persistent: true,
          contentType: message.properties.contentType,
          messageId: message.properties.messageId,
          type: message.properties.type,
          timestamp: message.properties.timestamp,
          headers,
          ...extra,
        },
        done,
      ),
    );

  // If the channel has closed, the broker gives the message to us again.
  const settle = (action) => {
    try {
      action();
    } catch (error) {
      logger.warn(
        { err: error },
        "could not ack the event; it will come again",
      );
    }
  };

  async function handle(message, event, headers, attempt) {
    if (!event) {
      logger.error(
        { queue },
        "not a valid event; moving it to the dead-letter queue",
      );
      await sendTo(DEAD_LETTER_QUEUE, message, {
        ...headers,
        "x-failed-queue": queue,
        "x-error": "not a valid event",
      });
      return;
    }

    const handler = handlers[event.type];
    if (!handler) {
      logger.warn({ queue }, "no handler for this event type; skipping it");
      return;
    }

    try {
      checkEvent?.(event);
      await handler(event, { attempt });
    } catch (error) {
      const hopeless = error?.retryable === false;
      if (hopeless || attempt >= maxAttempts) {
        logger.error(
          { err: error, attempt },
          hopeless
            ? "trying this event again won't help; moving it to the dead-letter queue"
            : "event failed for the last time; moving it to the dead-letter queue",
        );
        await sendTo(DEAD_LETTER_QUEUE, message, {
          ...headers,
          "x-attempts": attempt,
          "x-failed-queue": queue,
          "x-error": String(error?.message ?? error).slice(0, 500),
        });
        return;
      }

      const delay = Math.min(
        retryDelayMs * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      );
      logger.warn(
        { err: error, attempt, retryInMs: delay },
        "event failed; trying again later",
      );
      await sendTo(
        retryQueueFor(queue),
        message,
        { ...headers, "x-attempts": attempt + 1 },
        { expiration: String(delay) },
      );
    }
  }

  return async function onMessage(message) {
    if (!message) {
      logger.warn({ queue }, "the broker cancelled this consumer");
      return;
    }

    const headers = { ...message.properties.headers };
    const attempts = headers["x-attempts"];
    const attempt = Number.isInteger(attempts) && attempts > 0 ? attempts : 1;
    const event = parseEvent(message.content);
    const requestId = headers["x-request-id"];
    const context = {
      eventId: event?.id,
      eventType: event?.type,
      requestId: typeof requestId === "string" ? requestId : undefined,
    };

    await logContext.run(context, async () => {
      try {
        await handle(message, event, headers, attempt);
        settle(() => channel.ack(message));
      } catch (error) {
        logger.error(
          { err: error },
          "could not retry or dead-letter the event; putting it back",
        );
        settle(() => channel.nack(message, false, true));
      }
    });
  };
}

/**
 * Connects to RabbitMQ and reconnects by itself if the connection drops.
 * At start-up it gives up after about 3 seconds, so a wrong RABBITMQ_URL
 * stops the service.
 *
 * @param {object} options
 * @param {string} options.url RABBITMQ_URL. Never logged, because it holds a password.
 * @param {string} options.service Names this service's queue.
 * @param {import("pino").Logger} options.logger
 * @param {number} [options.retryDelayMs] Wait before the first retry. It doubles each time, up to a minute.
 * @param {number} [options.maxAttempts]
 * @param {number} [options.prefetch] How many events this service handles at once.
 * @param {object | null} [options.eventSpec] From loadEventSpec. Published and received events are checked against it. Pass null to skip the checks.
 * @param {(error: Error) => void} [options.onFatal] Called when the broker closes our channel, which only happens because of a bug. Defaults to exiting, so Docker restarts the service.
 * @param {Function} [options.connect] For tests.
 */
export async function connectEvents({
  url,
  service,
  logger,
  retryDelayMs = 5000,
  maxAttempts = MAX_ATTEMPTS,
  prefetch = 10,
  eventSpec = loadEventSpec(),
  onFatal = () => setImmediate(() => process.exit(1)),
  connect = amqp.connect,
}) {
  const checkEvent = eventSpec ? createEventChecker(eventSpec) : undefined;
  const consumers = [];
  const inFlight = new Set();
  let channel = null;
  let closing = false;

  async function startConsumer(ch, consumer) {
    const { queue, handlers } = consumer;
    await ch.assertQueue(queue, { durable: true });
    await ch.assertQueue(retryQueueFor(queue), {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": queue,
      },
    });
    for (const type of Object.keys(handlers)) {
      await ch.bindQueue(queue, EXCHANGE, type);
    }

    const onMessage = createDeliveryHandler({
      channel: ch,
      queue,
      handlers,
      logger,
      maxAttempts,
      retryDelayMs,
      checkEvent,
    });
    const { consumerTag } = await ch.consume(queue, (message) => {
      const work = onMessage(message)
        .catch((error) => logger.error({ err: error }, "event handling broke"))
        .finally(() => inFlight.delete(work));
      inFlight.add(work);
    });
    consumer.consumerTag = consumerTag;
  }

  // Runs on every (re)connect, so queues and consumers come back by themselves.
  async function setup(model) {
    const ch = await model.createConfirmChannel();
    ch.on("error", (error) => {
      if (closing) return;
      logger.fatal({ err: error }, "the event broker closed our channel");
      onFatal(error);
    });
    ch.on("close", () => {
      if (channel === ch) channel = null;
    });
    ch.on("return", (message) => {
      logger.warn(
        { eventType: message.properties.type },
        "no queue listens for this event yet, so it was dropped",
      );
    });

    await ch.assertExchange(EXCHANGE, "topic", { durable: true });
    await ch.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await ch.prefetch(prefetch);
    for (const consumer of consumers) await startConsumer(ch, consumer);
    channel = ch;
  }

  const connection = await connect(url, {
    clientProperties: { connection_name: service },
    recovery: { initialMaxRetries: 5, maxRetries: Infinity, setup },
  });
  connection.on("error", (error) => {
    logger.warn({ err: error }, "event broker connection error");
  });
  connection.on("disconnect", (error) => {
    channel = null;
    if (!closing)
      logger.warn({ err: error }, "lost the event broker; reconnecting");
  });
  connection.on("connect", () =>
    logger.info("reconnected to the event broker"),
  );
  connection.on("reconnect-failed", (error) => {
    logger.fatal({ err: error }, "gave up reconnecting to the event broker");
    onFatal(error);
  });
  logger.info("connected to the event broker");

  /**
   * Sends an event to every service that listens for its type. Resolves once
   * RabbitMQ has it. An event that doesn't match asyncapi.yaml throws an
   * EventSpecError before it is sent, because it is a bug in the sender. Inside a request, the request ID goes with it, so the
   * logs of every service that handles the event show the same ID.
   * @param {string} type Such as `booking.confirmed`.
   * @param {object} data The event's `data`, as asyncapi.yaml describes it.
   */
  async function publish(
    type,
    data,
    {
      version = 1,
      id = randomUUID(),
      occurredAt = new Date().toISOString(),
    } = {},
  ) {
    if (!EVENT_TYPE.test(type))
      throw new TypeError(`"${type}" is not an event type`);
    const event = {
      id,
      type,
      occurredAt,
      version,
      data,
    };
    checkEvent?.(event);
    const ch = channel;
    if (!ch || closing) throw serviceUnavailable();

    const requestId = logContext.getStore()?.requestId;
    try {
      await confirmed((done) =>
        ch.publish(
          EXCHANGE,
          type,
          Buffer.from(JSON.stringify(event)),
          {
            persistent: true,
            mandatory: true,
            contentType: "application/json",
            messageId: event.id,
            type,
            timestamp: Math.floor(Date.now() / 1000),
            headers: requestId ? { "x-request-id": requestId } : {},
          },
          done,
        ),
      );
    } catch (error) {
      throw Object.assign(serviceUnavailable(), { cause: error });
    }
    return event;
  }

  /**
   * Starts handling events from this service's queue. Call it once, with a
   * handler for each event type. Handlers may get the same event twice, so
   * they skip an `id` they have already handled.
   * @param {Record<string, (event: object, info: { attempt: number }) => Promise<void>>} handlers
   * @param {{ queue?: string }} [options]
   */
  async function consume(handlers, { queue = service } = {}) {
    for (const type of Object.keys(handlers)) {
      if (!EVENT_TYPE.test(type))
        throw new TypeError(`"${type}" is not an event type`);
      if (checkEvent && !checkEvent.knows(type))
        throw new TypeError(`"${type}" isn't an event in asyncapi.yaml`);
    }
    if (consumers.some((consumer) => consumer.queue === queue)) {
      throw new Error(
        `Already consuming "${queue}". Pass all handlers in one call.`,
      );
    }
    const consumer = { queue, handlers };
    consumers.push(consumer);
    if (channel) await startConsumer(channel, consumer);
  }

  /** For `/ready`. */
  const isReady = () => channel !== null && !closing;

  /** Stops taking events, waits for the ones being handled, then disconnects. */
  async function close() {
    if (closing) return;
    closing = true;
    const ch = channel;
    if (ch) {
      for (const { consumerTag } of consumers) {
        if (consumerTag) await ch.cancel(consumerTag).catch(() => {});
      }
    }
    await Promise.allSettled(inFlight);
    await connection.close();
    channel = null;
  }

  return { publish, consume, isReady, close };
}
