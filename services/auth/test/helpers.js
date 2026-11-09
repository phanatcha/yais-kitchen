import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  createEventChecker,
  createLogger,
  createTokenVerifier,
  serviceUnavailable,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import request from "supertest";
import { createAuthApp, REFRESH_COOKIE } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import {
  createCodeHasher,
  createTokenSigner,
  publicKeyOf,
} from "../src/secrets.js";
import { createStore } from "../src/store.js";

/** A MongoDB just for one test file. The first run downloads MongoDB. */
export async function startDatabase() {
  const server = await MongoMemoryServer.create();
  const connection = await mongoose
    .createConnection(server.getUri(), { dbName: "auth-test" })
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

/** Records what auth publishes, after checking it against asyncapi.yaml. */
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

/**
 * The auth app on a test database, with a clock the test can move and a
 * fresh key pair.
 */
export async function startAuth(store) {
  const privateKey = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const verifyToken = await createTokenVerifier(publicKeyOf(privateKey));
  const clock = { time: Date.now() };
  const events = fakeEvents();
  const logger = createLogger({ service: "auth-test", level: "silent" });
  const auth = createAuth({
    store,
    signer: await createTokenSigner(privateKey),
    hasher: createCodeHasher(privateKey),
    events,
    logger,
    now: () => new Date(clock.time),
  });
  const app = createAuthApp({
    auth,
    verifyToken,
    logger,
    validateResponses: true,
  });
  return { app, clock, events, verifyToken };
}

/** The refresh token a response set, or null when it set none. */
export function refreshCookieOf(res) {
  const cookie = (res.headers["set-cookie"] ?? []).find((c) =>
    c.startsWith(`${REFRESH_COOKIE}=`),
  );
  return cookie ? cookie.split(";")[0].slice(REFRESH_COOKIE.length + 1) : null;
}

/** Asks for a code and returns the one auth sent to notification. */
export async function askForCode({ app, events }, email) {
  const res = await request(app).post("/auth/codes").send({ email });
  if (res.status !== 202)
    throw new Error(`asking for a code gave ${res.status}`);
  return events.of("auth.code_requested").at(-1).data.code;
}

/** Signs in with a fresh code. */
export async function signIn(ctx, email) {
  const code = await askForCode(ctx, email);
  const res = await request(ctx.app)
    .post("/auth/sessions")
    .send({ email, code });
  if (res.status !== 200) throw new Error(`signing in gave ${res.status}`);
  return {
    token: res.body.accessToken,
    user: res.body.user,
    refresh: refreshCookieOf(res),
  };
}
