import { EventEmitter } from "node:events";
import { createLogger } from "../src/logger.js";

/** A logger that keeps its lines in memory, as parsed JSON. */
export function captureLogs() {
  const lines = [];
  const destination = { write: (line) => lines.push(JSON.parse(line)) };
  return {
    lines,
    logger: createLogger({ service: "test", level: "debug", destination }),
  };
}

/** Stands in for an amqplib confirm channel and records what was done. */
export class FakeChannel extends EventEmitter {
  queues = new Map();
  bindings = [];
  exchanges = [];
  published = [];
  sent = [];
  acked = [];
  nacked = [];
  cancelled = [];
  consumers = new Map();
  failSends = false;
  closed = false;

  async assertExchange(name, type, options) {
    this.exchanges.push({ name, type, options });
  }
  async assertQueue(name, options) {
    this.queues.set(name, options);
    return { queue: name };
  }
  async prefetch(count) {
    this.prefetchCount = count;
  }
  async bindQueue(queue, exchange, key) {
    this.bindings.push({ queue, exchange, key });
  }
  async consume(queue, onMessage) {
    this.consumers.set(queue, onMessage);
    return { consumerTag: `tag-${queue}` };
  }
  async cancel(tag) {
    this.cancelled.push(tag);
  }
  #confirm(callback) {
    const error = this.failSends ? new Error("broker said no") : null;
    queueMicrotask(() => callback(error));
    return true;
  }
  publish(exchange, routingKey, content, options, callback) {
    this.published.push({ exchange, routingKey, content, options });
    return this.#confirm(callback);
  }
  sendToQueue(queue, content, options, callback) {
    this.sent.push({ queue, content, options });
    return this.#confirm(callback);
  }
  ack(message) {
    if (this.closed) throw new Error("Channel closed");
    this.acked.push(message);
  }
  nack(message, allUpTo, requeue) {
    if (this.closed) throw new Error("Channel closed");
    this.nacked.push({ message, requeue });
  }
}

/** Stands in for amqplib.connect with recovery turned on. */
export function fakeBroker() {
  const model = {
    channels: [],
    async createConfirmChannel() {
      const channel = new FakeChannel();
      this.channels.push(channel);
      return channel;
    },
  };
  const connection = new EventEmitter();
  connection.close = async () => {
    connection.closed = true;
  };

  let options;
  return {
    connection,
    get channel() {
      return model.channels.at(-1);
    },
    get options() {
      return options;
    },
    async connect(url, socketOptions) {
      options = socketOptions;
      await socketOptions.recovery.setup(model);
      return connection;
    },
    async reconnect() {
      this.channel.closed = true;
      connection.emit("disconnect", new Error("connection lost"));
      await options.recovery.setup(model);
      connection.emit("connect", model);
    },
  };
}

let counter = 0;

/** An event envelope as asyncapi.yaml describes it. */
export function makeEvent(
  type = "booking.confirmed",
  data = { bookingId: "b1" },
) {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    type,
    occurredAt: "2026-11-20T09:00:00.000Z",
    version: 1,
    data,
  };
}

/** A delivery as amqplib hands it to a consumer. */
export function makeMessage(event, headers = {}) {
  const content = Buffer.from(
    typeof event === "string" ? event : JSON.stringify(event),
  );
  return {
    content,
    fields: { deliveryTag: 1, redelivered: false },
    properties: {
      contentType: "application/json",
      messageId: event?.id,
      type: event?.type,
      timestamp: 1794000000,
      headers,
    },
  };
}
