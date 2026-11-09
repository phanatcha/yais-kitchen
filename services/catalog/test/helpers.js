import { randomUUID } from "node:crypto";
import {
  createEventChecker,
  createLogger,
  createTokenVerifier,
  serviceUnavailable,
} from "@yais-kitchen/shared";
import { createTestKeys } from "@yais-kitchen/shared/testing";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import request from "supertest";
import { createCatalogApp } from "../src/app.js";
import { createStore } from "../src/store.js";

export const MEDIA = "https://media.example.test";
export const INTERNAL_TOKEN = "internal-token-for-tests-0123456789abcdef";
export const ASSET = "6650a1f2c3d4e5f6a7b8c9a1";
export const HOUR = 60 * 60 * 1000;

/** A MongoDB just for one test file. The first run downloads MongoDB. */
export async function startDatabase() {
  const server = await MongoMemoryServer.create();
  const connection = await mongoose
    .createConnection(server.getUri(), { dbName: "catalog-test" })
    .asPromise();
  const store = createStore(connection);
  await store.init();
  return {
    store,
    async clear() {
      await Promise.all(
        Object.values(connection.collections).map((c) => c.deleteMany({})),
      );
    },
    async stop() {
      await connection.close();
      await server.stop();
    },
  };
}

const checkEvent = createEventChecker();

/** Records what catalog publishes, after checking it against asyncapi.yaml. */
export function fakeEvents() {
  const events = {
    published: [],
    down: false,
    async publish(type, data) {
      if (events.down) throw serviceUnavailable();
      const event = {
        id: randomUUID(),
        type,
        occurredAt: new Date().toISOString(),
        version: 1,
        data,
      };
      checkEvent(event);
      events.published.push(event);
      return event;
    },
    of: (type) => events.published.filter((event) => event.type === type),
  };
  return events;
}

/** The catalog app on a test database, with a clock the test can move. */
export async function startCatalog(store) {
  const keys = await createTestKeys();
  const clock = { time: Date.now() };
  const events = fakeEvents();
  const app = createCatalogApp({
    store,
    events,
    mediaPublicUrl: `${MEDIA}/`,
    verifyToken: await createTokenVerifier(keys.publicKeyPem),
    internalToken: INTERNAL_TOKEN,
    logger: createLogger({ service: "catalog-test", level: "silent" }),
    now: () => new Date(clock.time),
    validateResponses: true,
  });

  let next = 0;
  /** An `Authorization` header for someone with this role. */
  async function as(role, claims = {}) {
    next += 1;
    const sub =
      claims.sub ?? `6650a1f2c3d4e5f6a7b8${String(next).padStart(4, "0")}`;
    return `Bearer ${await keys.signToken({ ...claims, sub, role })}`;
  }

  const admin = await as("admin");
  const call = (method, path, auth = admin) => {
    const req = request(app)[method](path);
    return auth ? req.set("authorization", auth) : req;
  };

  return {
    app,
    clock,
    events,
    as,
    admin,
    call,
    /** Makes a Yai as Admin, visible unless told otherwise. */
    async makeYai(fields = {}) {
      const res = await call("post", "/catalog/yais").send({
        name: "Yai Somsri",
        nameThai: "ยายสมศรี",
        region: "north",
        story: "She has cooked for her village for fifty years.",
        photoAssetIds: [ASSET],
        isSample: true,
        isVisible: true,
        ...fields,
      });
      if (res.status !== 201) throw new Error(JSON.stringify(res.body));
      return res.body;
    },
    /** Makes a class as Admin, visible unless told otherwise. */
    async makeClass(yaiId, fields = {}) {
      const res = await call("post", "/catalog/classes").send({
        yaiId,
        dish: "Khao Soi",
        dishThai: "ข้าวซอย",
        description: "Curry noodle soup from Chiang Mai.",
        price: { amount: 90000, currency: "THB" },
        durationMinutes: 120,
        maxGuests: 4,
        photoAssetId: ASSET,
        isVisible: true,
        ...fields,
      });
      if (res.status !== 201) throw new Error(JSON.stringify(res.body));
      return res.body;
    },
  };
}
