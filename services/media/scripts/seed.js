// Turns the sample photos in samples/ into ready assets, so the sample Yais
// and classes that catalog's seed adds have real pictures. Each file is
// named after the asset ID catalog uses. Safe to run again: ready ones are
// skipped.
//
//   npm run seed -w @yais-kitchen/media                  (media on this machine)
//   docker compose -f infra/docker-compose.yml exec media node scripts/seed.js
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, loadConfig } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createProcessor, mediaPaths } from "../src/process.js";
import { createStore } from "../src/store.js";

const SAMPLES = fileURLToPath(new URL("../samples", import.meta.url));
const TYPES = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const config = loadConfig({
  MONGO_URL: { type: "url" },
  MEDIA_DIR: {
    default: fileURLToPath(new URL("../../../.media", import.meta.url)),
  },
});
const logger = createLogger({ service: "media-seed", level: "warn" });
const connection = await mongoose
  .createConnection(config.MONGO_URL, { dbName: "media" })
  .asPromise();
const store = createStore(connection);
const dir = path.resolve(config.MEDIA_DIR);
const paths = mediaPaths(dir);
const processAsset = createProcessor({ store, dir, logger });

let added = 0;
for (const name of (await readdir(SAMPLES)).sort()) {
  const ext = path.extname(name);
  const id = path.basename(name, ext);
  if (!TYPES[ext] || !mongoose.isValidObjectId(id)) continue;
  const existing = await store.Asset.findById(id);
  if (existing?.status === "ready") continue;

  const source = path.join(SAMPLES, name);
  await mkdir(path.dirname(paths.upload(id)), { recursive: true });
  await copyFile(source, paths.upload(id));
  const asset = await store.Asset.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        kind: "photo",
        status: "processing",
        ownerId: "seed",
        contentType: TYPES[ext],
        sizeBytes: (await stat(source)).size,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  await processAsset(asset);
  const done = await store.Asset.findById(id);
  if (done.status !== "ready")
    throw new Error(`${name}: ${done.rejectReason ?? "not processed"}`);
  added += 1;
}

console.log(`Ready ${added} sample photo${added === 1 ? "" : "s"}.`);
await connection.close();
