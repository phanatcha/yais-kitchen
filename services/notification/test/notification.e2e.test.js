// Runs through a real RabbitMQ, MongoDB and Mailpit, only when all three are
// set. Stop any notification service you have running first, or it sends the
// same emails too. For example:
//
//   npm run up
//   docker compose -f infra/docker-compose.yml stop notification
//   RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672 MONGO_URL=mongodb://127.0.0.1:27017 \
//     MAILPIT_URL=http://127.0.0.1:8025 npm test
import { randomUUID } from "node:crypto";
import { connectEvents, createLogger, EXCHANGE } from "@yais-kitchen/shared";
import amqp from "amqplib";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SAMPLE_CLASS_TIME,
  sampleBooking,
  sampleData,
} from "../scripts/samples.js";
import { createLinks } from "../src/links.js";
import { createMailer } from "../src/mailer.js";
import { createNotification } from "../src/notification.js";
import { createStore } from "../src/store.js";
import { fakeCatalog } from "./helpers.js";

const { RABBITMQ_URL, MONGO_URL, MAILPIT_URL } = process.env;
const run = randomUUID().slice(0, 8);
const address = (who) => `${who}-${run}@example.com`;
const logger = createLogger({ service: "notification-e2e", level: "silent" });

async function mailpit(path, init) {
  const response = await fetch(new URL(path, MAILPIT_URL), init);
  if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);
  return response.status === 200 ? response.json() : null;
}

/** The emails Mailpit caught for one address, oldest first. */
async function inbox(to) {
  const query = encodeURIComponent(`to:"${to}"`);
  const { messages } = await mailpit(`/api/v1/search?query=${query}`);
  return messages.reverse();
}

async function waitForInbox(to, count) {
  let messages = [];
  await expect
    .poll(async () => (messages = await inbox(to)).length, { timeout: 10_000 })
    .toBe(count);
  return messages;
}

describe.skipIf(!RABBITMQ_URL || !MONGO_URL || !MAILPIT_URL)(
  "notification through RabbitMQ, MongoDB and Mailpit",
  { timeout: 30_000 },
  () => {
    let connection;
    let store;
    let consumer;
    let publisher;
    let mailer;
    let reminders;
    const service = `notification-e2e-${run}`;
    const booking = sampleBooking({
      email: address("guest"),
      startsAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 73.5 * 60 * 60 * 1000).toISOString(),
    });

    beforeAll(async () => {
      connection = await mongoose
        .createConnection(MONGO_URL, { dbName: service })
        .asPromise();
      store = createStore(connection);
      await store.init();
      mailer = createMailer({
        host: process.env.SMTP_HOST ?? "127.0.0.1",
        port: Number(process.env.SMTP_PORT ?? 1025),
        from: "Yai's Kitchen <hello@yais-kitchen.local>",
      });
      const notification = createNotification({
        store,
        mailer,
        catalog: fakeCatalog(SAMPLE_CLASS_TIME),
        links: createLinks("http://localhost:5173"),
        adminEmail: address("admin"),
        logger,
      });
      reminders = notification.reminders;
      consumer = await connectEvents({ url: RABBITMQ_URL, service, logger });
      await consumer.consume(notification.handlers);
      publisher = await connectEvents({
        url: RABBITMQ_URL,
        service: `${service}-publisher`,
        logger,
      });
    }, 30_000);

    afterAll(async () => {
      await reminders?.stop();
      await publisher?.close();
      await consumer?.close();
      mailer?.close();
      const amqpConnection = await amqp.connect(RABBITMQ_URL);
      const channel = await amqpConnection.createChannel();
      await channel.deleteQueue(service);
      await channel.deleteQueue(`${service}.retry`);
      await amqpConnection.close();
      await connection?.dropDatabase();
      await connection?.close();
      await mailpit(
        `/api/v1/search?query=${encodeURIComponent(`to:"${run}"`)}`,
        { method: "DELETE" },
      ).catch(() => {});
    });

    it("puts the right email in Mailpit for each event", async () => {
      const publish = (type) =>
        publisher.publish(type, sampleData(type, { booking }));

      await publish("auth.code_requested");
      let guest = await waitForInbox(booking.email, 1);
      expect(guest[0].Subject).toBe("Your Yai's Kitchen sign-in code");

      await publisher.publish("application.received", {
        ...sampleData("application.received"),
        email: address("family"),
      });
      expect((await waitForInbox(address("family"), 1))[0].Subject).toBe(
        "We got the application for Yai Malai",
      );
      expect((await waitForInbox(address("admin"), 1))[0].Subject).toBe(
        "New Become a Yai application: Yai Malai",
      );

      await publish("booking.confirmed");
      guest = await waitForInbox(booking.email, 2);
      expect(guest[1].Subject).toBe("You're booked: Khao Soi with Yai Somsri");
      const { Text } = await mailpit(`/api/v1/message/${guest[1].ID}`);
      expect(Text).toContain(
        "You're cooking Khao Soi (ข้าวซอย) with Yai Somsri.",
      );
      expect(Text).toContain("- Fresh egg noodles (บะหมี่ไข่): 200 g");

      await publish("live_class.ended");
      guest = await waitForInbox(booking.email, 3);
      expect(guest[2].Subject).toBe("Thank you for cooking with Yai Somsri");

      await publish("recording.ready");
      guest = await waitForInbox(booking.email, 4);
      expect(guest[3].Subject).toBe("Your class recording is ready");
    });

    it("sends nothing for a repeated event", async () => {
      const to = address("repeat");
      const event = {
        id: randomUUID(),
        type: "auth.code_requested",
        occurredAt: new Date().toISOString(),
        version: 1,
        data: { ...sampleData("auth.code_requested"), email: to },
      };
      const amqpConnection = await amqp.connect(RABBITMQ_URL);
      const channel = await amqpConnection.createConfirmChannel();
      for (let copy = 0; copy < 2; copy += 1) {
        channel.publish(
          EXCHANGE,
          event.type,
          Buffer.from(JSON.stringify(event)),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.id,
          },
        );
      }
      await channel.waitForConfirms();
      await amqpConnection.close();

      await waitForInbox(to, 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await inbox(to)).toHaveLength(1);
    });

    it("cancels the reminders of a cancelled booking", async () => {
      const cancelled = sampleBooking({
        ...booking,
        bookingId: "6650a1f2c3d4e5f6a7b8c9fa",
        email: address("cancel"),
      });
      await publisher.publish(
        "booking.confirmed",
        sampleData("booking.confirmed", { booking: cancelled }),
      );
      await waitForInbox(cancelled.email, 1);

      await publisher.publish(
        "booking.cancelled",
        sampleData("booking.cancelled", { booking: cancelled }),
      );
      const messages = await waitForInbox(cancelled.email, 2);
      expect(messages[1].Subject).toBe(
        "Booking cancelled: Khao Soi with Yai Somsri",
      );
      const kept = await store.models.Reminder.find({
        bookingId: cancelled.bookingId,
      }).lean();
      expect(kept.map((reminder) => reminder.status)).toEqual([
        "cancelled",
        "cancelled",
      ]);
    });
  },
);
