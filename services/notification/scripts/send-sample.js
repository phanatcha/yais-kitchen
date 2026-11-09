// Publishes sample events, so you can see the emails in Mailpit at
// http://localhost:8025. Every address in them is made up.
//
//   npm run send-sample -w @yais-kitchen/notification
//   npm run send-sample -w @yais-kitchen/notification -- booking.confirmed
//
// With no type it sends every sample except user.deleted, one a second, so
// notification handles them in order.
import { setTimeout as wait } from "node:timers/promises";
import { connectEvents, createLogger, loadConfig } from "@yais-kitchen/shared";
import { SAMPLE_TYPES, sampleBooking, sampleData } from "./samples.js";

const HOUR_MS = 60 * 60 * 1000;

const named = process.argv.slice(2);
const unknown = named.filter((type) => !SAMPLE_TYPES.includes(type));
if (unknown.length > 0) {
  console.error(
    `No sample for ${unknown.join(", ")}. Try: ${SAMPLE_TYPES.join(", ")}`,
  );
  process.exit(1);
}
const types =
  named.length > 0
    ? named
    : SAMPLE_TYPES.filter((type) => type !== "user.deleted");

const config = loadConfig({ RABBITMQ_URL: { type: "url" } });
const logger = createLogger({ service: "send-sample", level: "warn" });
const events = await connectEvents({
  url: config.RABBITMQ_URL,
  service: "send-sample",
  logger,
});

// A class three days from now, on the hour, so its reminders are still ahead.
const startsAt = new Date(
  Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + 72 * HOUR_MS,
);
const booking = sampleBooking({
  startsAt: startsAt.toISOString(),
  endsAt: new Date(startsAt.getTime() + 1.5 * HOUR_MS).toISOString(),
});

for (const [index, type] of types.entries()) {
  if (index > 0) await wait(1000);
  const event = await events.publish(type, sampleData(type, { booking }));
  console.log(`sent ${type} ${event.id}`);
}
await events.close();
