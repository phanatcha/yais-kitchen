import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLogger, createTokenVerifier } from "@yais-kitchen/shared";
import { createTestKeys } from "@yais-kitchen/shared/testing";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMediaApp } from "../src/app.js";
import { createProcessor } from "../src/process.js";
import { createStore } from "../src/store.js";

const PUBLIC = "http://media.example.test";
const WEB = "http://web.example.test";
let server, connection, store, dir, app, keys, pending;

const as = async (role, sub) => `Bearer ${await keys.signToken({ sub, role })}`;
const ADMIN = "6650a1f2c3d4e5f6a7b80001";
const FAMILY = "6650a1f2c3d4e5f6a7b80002";
const OTHER = "6650a1f2c3d4e5f6a7b80003";

const jpeg = () =>
  sharp({
    create: { width: 2000, height: 1200, channels: 3, background: "#c84" },
  })
    .jpeg()
    .toBuffer();

// Turns an upload link into a path supertest can call on the app.
const local = (url) => url.slice(PUBLIC.length);

async function upload(auth, body, file) {
  const created = await request(app)
    .post("/media/uploads")
    .set("authorization", auth)
    .send(body);
  expect(created.status).toBe(201);
  if (file) {
    const put = await request(app)
      .put(local(created.body.uploadUrl))
      .set("content-type", body.contentType)
      .send(file);
    expect(put.status).toBe(204);
  }
  return created.body;
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  connection = await mongoose
    .createConnection(server.getUri(), { dbName: "media-test" })
    .asPromise();
  store = createStore(connection);
  await store.init();
  dir = await mkdtemp(path.join(tmpdir(), "media-test-"));
  keys = await createTestKeys();
  const logger = createLogger({ service: "media-test", level: "silent" });
  const processAsset = createProcessor({ store, dir, logger });
  app = createMediaApp({
    store,
    dir,
    publicUrl: PUBLIC,
    webOrigin: WEB,
    processAsset: (asset) => pending.push(processAsset(asset)),
    verifyToken: await createTokenVerifier(keys.publicKeyPem),
    logger,
    validateResponses: true,
  });
});

beforeEach(async () => {
  pending = [];
  await store.Asset.deleteMany({});
});

afterAll(async () => {
  await connection.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("photos", () => {
  it("uploads, resizes to three WebP sizes and serves them", async () => {
    const auth = await as("family", FAMILY);
    const file = await jpeg();
    const { assetId } = await upload(
      auth,
      { kind: "photo", contentType: "image/jpeg", sizeBytes: file.length },
      file,
    );

    const done = await request(app)
      .post(`/media/uploads/${assetId}/complete`)
      .set("authorization", auth);
    expect(done.status).toBe(202);
    expect(done.body.status).toBe("processing");
    await Promise.all(pending);

    const asset = await request(app)
      .get(`/media/assets/${assetId}`)
      .set("authorization", auth);
    expect(asset.body.status).toBe("ready");
    expect(asset.body.photo.urls.card).toBe(
      `${PUBLIC}/files/${assetId}/card.webp`,
    );

    const card = await request(app)
      .get(`/files/${assetId}/card.webp`)
      .buffer(true)
      .parse((res, done) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(card.status).toBe(200);
    expect(card.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    const meta = await sharp(card.body).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 800 });
  });

  it("rejects a file that is not really a photo", async () => {
    const auth = await as("admin", ADMIN);
    const fake = Buffer.from("not a jpeg at all");
    const { assetId } = await upload(
      auth,
      { kind: "photo", contentType: "image/jpeg", sizeBytes: fake.length },
      fake,
    );
    await request(app)
      .post(`/media/uploads/${assetId}/complete`)
      .set("authorization", auth);
    await Promise.all(pending);
    const asset = await request(app)
      .get(`/media/assets/${assetId}`)
      .set("authorization", auth);
    expect(asset.body).toMatchObject({ status: "rejected" });
    expect(asset.body.rejectReason).toBeTruthy();
  });

  it("refuses photos over 15 MB and the wrong kind of file", async () => {
    const auth = await as("admin", ADMIN);
    const big = await request(app)
      .post("/media/uploads")
      .set("authorization", auth)
      .send({ kind: "photo", contentType: "image/png", sizeBytes: 16e6 });
    expect(big.status).toBe(400);
    const wrong = await request(app)
      .post("/media/uploads")
      .set("authorization", auth)
      .send({ kind: "intro_video", contentType: "image/png", sizeBytes: 10 });
    expect(wrong.status).toBe(400);
  });
});

describe("videos", () => {
  it("rejects a video that is not MP4 or MOV", async () => {
    const auth = await as("admin", ADMIN);
    const fake = Buffer.alloc(64, 1);
    const { assetId } = await upload(
      auth,
      { kind: "intro_video", contentType: "video/mp4", sizeBytes: 64 },
      fake,
    );
    await request(app)
      .post(`/media/uploads/${assetId}/complete`)
      .set("authorization", auth);
    await Promise.all(pending);
    const asset = await store.Asset.findById(assetId);
    expect(asset.status).toBe("rejected");
  });
});

describe("upload links", () => {
  it("refuse a wrong token, a bigger file, and a second upload", async () => {
    const auth = await as("admin", ADMIN);
    const created = await upload(auth, {
      kind: "photo",
      contentType: "image/jpeg",
      sizeBytes: 10,
    });
    const url = new URL(created.uploadUrl);

    const wrong = await request(app)
      .put(`${url.pathname}?token=nope`)
      .set("content-type", "image/jpeg")
      .send(Buffer.alloc(5));
    expect(wrong.status).toBe(403);

    const tooBig = await request(app)
      .put(local(created.uploadUrl))
      .set("content-type", "image/jpeg")
      .send(Buffer.alloc(11));
    expect(tooBig.status).toBe(400);

    const early = await request(app)
      .post(`/media/uploads/${created.assetId}/complete`)
      .set("authorization", auth);
    expect(early.status).toBe(409);
  });

  it("answer the web app's CORS preflight", async () => {
    const res = await request(app)
      .options("/uploads/6650a1f2c3d4e5f6a7b8c9a1")
      .set("origin", WEB);
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(WEB);
  });
});

describe("who can see what", () => {
  it("hides one family's file from another, not from Admin", async () => {
    const { assetId } = await upload(await as("family", FAMILY), {
      kind: "photo",
      contentType: "image/png",
      sizeBytes: 10,
    });
    const other = await request(app)
      .get(`/media/assets/${assetId}`)
      .set("authorization", await as("family", OTHER));
    expect(other.status).toBe(404);
    const admin = await request(app)
      .get(`/media/assets/${assetId}`)
      .set("authorization", await as("admin", ADMIN));
    expect(admin.body.status).toBe("waiting_for_upload");
  });

  it("refuses tourists", async () => {
    const res = await request(app)
      .post("/media/uploads")
      .set("authorization", await as("tourist", OTHER))
      .send({ kind: "photo", contentType: "image/png", sizeBytes: 10 });
    expect(res.status).toBe(403);
  });
});
