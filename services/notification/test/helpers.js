import { randomUUID } from "node:crypto";
import { createEventChecker } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";

const checkEvent = createEventChecker();

/** A whole event. It must match asyncapi.yaml, so the tests can't drift. */
export function makeEvent(type, data, occurredAt = new Date()) {
  const event = {
    id: randomUUID(),
    type,
    occurredAt: occurredAt.toISOString(),
    version: 1,
    data,
  };
  checkEvent(event);
  return event;
}

/**
 * A MongoDB just for one test file. The first run downloads MongoDB, which
 * takes a while; after that it is cached.
 */
export async function startDatabase() {
  const server = await MongoMemoryServer.create();
  const connection = await mongoose
    .createConnection(server.getUri(), { dbName: "notification-test" })
    .asPromise();
  return {
    connection,
    async stop() {
      await connection.close();
      await server.stop();
    },
  };
}

/** Records what would be sent. `failNext` makes the next sends throw. */
export function fakeMailer() {
  const mailer = {
    sent: [],
    failNext: 0,
    async send(email) {
      if (mailer.failNext > 0) {
        mailer.failNext -= 1;
        throw new Error("SMTP is down");
      }
      mailer.sent.push(email);
    },
  };
  return mailer;
}

/** Answers like catalog. Set `answer` to null for 404 or an Error to fail. */
export function fakeCatalog(answer) {
  const catalog = {
    calls: [],
    answer,
    async getClassTime(classTimeId) {
      catalog.calls.push(classTimeId);
      if (catalog.answer instanceof Error) throw catalog.answer;
      return catalog.answer;
    },
  };
  return catalog;
}
