import { execFile } from "node:child_process";
import { open, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

// Widths from the Photo schema in openapi.yaml.
export const PHOTO_SIZES = { thumb: 400, card: 800, hero: 1600 };
const PHOTO_FORMATS = ["jpeg", "png", "webp"];

class Rejected extends Error {}

/**
 * Where files live. `uploads/` holds originals and is never served.
 * `files/` holds ready files at `{assetId}/{name}`, which is served.
 * @param {string} dir
 */
export function mediaPaths(dir) {
  return {
    upload: (id) => path.join(dir, "uploads", String(id)),
    files: path.join(dir, "files"),
    ready: (id) => path.join(dir, "files", String(id)),
  };
}

async function photo(source, out) {
  let meta;
  try {
    meta = await sharp(source).metadata();
  } catch {
    throw new Rejected("The file is not a photo we can read.");
  }
  if (!PHOTO_FORMATS.includes(meta.format))
    throw new Rejected("Photos must be JPEG, PNG or WebP.");
  for (const [name, width] of Object.entries(PHOTO_SIZES)) {
    await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(out, `${name}.webp`));
  }
  return {};
}

// MP4 and MOV both start with an `ftyp` box at byte 4.
async function isMp4OrMov(source) {
  const file = await open(source);
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(12), 0, 12, 0);
    return bytesRead === 12 && buffer.toString("latin1", 4, 8) === "ftyp";
  } finally {
    await file.close();
  }
}

async function video(source, out) {
  if (!(await isMp4OrMov(source)))
    throw new Rejected("Videos must be MP4 or MOV.");
  const mp4 = path.join(out, "video.mp4");
  try {
    // H.264 at most 720p, so every browser plays it and it starts fast.
    await run("ffmpeg", [
      ...["-v", "error", "-y", "-i", source],
      ...["-vf", "scale=-2:'min(720,ih)'", "-c:v", "libx264"],
      ...["-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p"],
      ...["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4],
    ]);
  } catch (error) {
    if (error.code === "ENOENT") throw error; // ffmpeg missing: our fault
    throw new Rejected("We couldn't read this video.");
  }
  const { stdout } = await run("ffprobe", [
    ...["-v", "error", "-show_entries", "format=duration"],
    ...["-of", "default=nw=1:nk=1", mp4],
  ]);
  const duration = Number.parseFloat(stdout);
  const frame = path.join(out, "poster.png");
  const at = Number.isFinite(duration) ? Math.min(1, duration / 2) : 0;
  await run("ffmpeg", [
    ...["-v", "error", "-y", "-ss", String(at), "-i", mp4],
    ...["-frames:v", "1", frame],
  ]);
  await sharp(frame)
    .webp({ quality: 80 })
    .toFile(path.join(out, "poster.webp"));
  await rm(frame);
  return Number.isFinite(duration)
    ? { durationSeconds: Math.round(duration) }
    : {};
}

/**
 * Checks and converts one uploaded file, then marks the asset ready or
 * rejected. Ready files appear all at once: they are made in a temporary
 * folder that is renamed at the end.
 */
export function createProcessor({ store, dir, logger }) {
  const paths = mediaPaths(dir);

  async function processAsset(asset) {
    const id = asset._id.toString();
    const source = paths.upload(id);
    const work = `${paths.ready(id)}.tmp`;
    try {
      await rm(work, { recursive: true, force: true });
      await mkdir(work, { recursive: true });
      const extra =
        asset.kind === "photo"
          ? await photo(source, work)
          : await video(source, work);
      await rm(paths.ready(id), { recursive: true, force: true });
      await rename(work, paths.ready(id));
      await store.Asset.updateOne(
        { _id: asset._id },
        { $set: { status: "ready", ...extra } },
      );
      await rm(source, { force: true });
    } catch (error) {
      await rm(work, { recursive: true, force: true });
      if (!(error instanceof Rejected)) {
        // Left as processing, so it is tried again when media restarts.
        logger.error({ err: error, assetId: id }, "processing failed");
        return;
      }
      await store.Asset.updateOne(
        { _id: asset._id },
        { $set: { status: "rejected", rejectReason: error.message } },
      );
      await rm(source, { force: true });
    }
  }

  // Runs in the background, so nothing it throws may escape.
  return (asset) =>
    processAsset(asset).catch((error) =>
      logger.error(
        { err: error, assetId: String(asset._id) },
        "processing failed",
      ),
    );
}
