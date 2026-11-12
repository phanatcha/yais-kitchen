import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import {
  createDurable,
  createLogger,
  createTokenVerifier,
} from "@yais-kitchen/shared";
import { createTestKeys } from "@yais-kitchen/shared/testing";

export const ids = {
  user: "6650a1f2c3d4e5f6a7b8c901",
  other: "6650a1f2c3d4e5f6a7b8c902",
  helper: "6650a1f2c3d4e5f6a7b8c903",
  yai: "6650a1f2c3d4e5f6a7b8c904",
  class: "6650a1f2c3d4e5f6a7b8c905",
  time: "6650a1f2c3d4e5f6a7b8c906",
};
export const internalToken = "test-internal-token-012345678901234567890";
export async function harness(createStore) {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const connection = await mongoose
    .createConnection(mongo.getUri())
    .asPromise();
  const store = createStore(connection);
  await store.init();
  const durable = createDurable(connection);
  const keys = await createTestKeys();
  const clock = { time: Date.parse("2027-01-01T00:00:00Z") };
  const ctx = {
    classTime: {
      id: ids.time,
      classId: ids.class,
      yaiId: ids.yai,
      helperId: ids.helper,
      status: "published",
      capacity: 6,
      startsAt: new Date(clock.time + 72 * 3600000).toISOString(),
      endsAt: new Date(clock.time + 74 * 3600000).toISOString(),
    },
    class: {
      id: ids.class,
      yaiId: ids.yai,
      yaiName: "Yai Test",
      dish: "Curry",
      dishThai: "แกง",
      price: { amount: 90001, currency: "THB" },
      durationMinutes: 120,
      isSample: false,
      photo: {
        assetId: ids.class,
        alt: "Curry",
        urls: {
          thumb: "https://example.test/t",
          card: "https://example.test/c",
          hero: "https://example.test/h",
        },
      },
    },
    yai: { id: ids.yai, name: "Yai Test" },
    ingredients: [{ id: "rice", name: "Rice", quantity: "1 cup" }],
  };
  const recipe = {
    steps: [{ text: "Prepare" }, { text: "Cook" }, { text: "Serve" }],
  };
  const catalog = async (path) =>
    path.includes("/recipe")
      ? recipe
      : path.includes("?")
        ? { items: [ctx.classTime] }
        : structuredClone(ctx);
  const user = {
    id: ids.user,
    role: "tourist",
    name: "Alex Test",
    email: "alex@example.test",
  };
  const auth = async (role = "tourist", sub = ids.user, extra = {}) =>
    `Bearer ${await keys.signToken({ sub, role, email: "alex@example.test", name: "Alex Test", ...extra })}`;
  return {
    connection,
    store,
    durable,
    clock,
    ctx,
    recipe,
    user,
    auth,
    catalog,
    options: {
      store,
      durable,
      catalog,
      now: () => new Date(clock.time),
      logger: createLogger({ service: "test", level: "silent" }),
      internalToken,
      verifyToken: await createTokenVerifier(keys.publicKeyPem),
      validateResponses: true,
    },
    async clear() {
      for (const collection of Object.values(connection.collections))
        await collection.deleteMany({});
    },
    async close() {
      await connection.close();
      await mongo.stop();
    },
  };
}
