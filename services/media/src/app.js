import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  badRequest,
  conflict,
  createApp,
  HttpError,
  notFound,
} from "@yais-kitchen/shared";
import express from "express";
import mongoose from "mongoose";
import { mediaPaths } from "./process.js";

const MB = 1024 * 1024;
export const MAX_BYTES = { photo: 15 * MB, video: 500 * MB };
const UPLOAD_MS = 60 * 60 * 1000;

const hash = (token) => createHash("sha256").update(token).digest("hex");
const isPhoto = (kind) => kind === "photo";

/** Turns a stored asset into the Asset shape in openapi.yaml. */
export function createView(filesUrl) {
  const base = filesUrl.replace(/\/+$/, "");
  const file = (id, name) => `${base}/${id}/${name}`;
  return function view(asset) {
    const id = asset._id.toString();
    const out = { id, kind: asset.kind, status: asset.status };
    if (asset.rejectReason) out.rejectReason = asset.rejectReason;
    if (asset.status !== "ready") return out;
    if (isPhoto(asset.kind)) {
      out.photo = {
        assetId: id,
        alt: "",
        urls: {
          thumb: file(id, "thumb.webp"),
          card: file(id, "card.webp"),
          hero: file(id, "hero.webp"),
        },
      };
    } else {
      out.video = {
        assetId: id,
        url: file(id, "video.mp4"),
        posterUrl: file(id, "poster.webp"),
        ...(asset.durationSeconds != null && {
          durationSeconds: asset.durationSeconds,
        }),
      };
    }
    return out;
  };
}

/**
 * Upload links and ready files. Neither is in the spec: the browser PUTs the
 * file straight here (like a signed storage link), and pages load ready
 * files from here. The upload link's token is the only key it needs.
 */
function fileRoutes({ store, paths, webOrigin, now }) {
  const routes = express.Router();

  // Ready files are public, like a CDN. Pages on another port load them.
  routes.use(
    "/files",
    express.static(paths.files, {
      immutable: true,
      maxAge: "365d",
      setHeaders: (res) =>
        res.set("Cross-Origin-Resource-Policy", "cross-origin"),
    }),
  );

  const cors = (req, res, next) => {
    if (webOrigin && req.get("origin") === webOrigin) {
      res.set("Access-Control-Allow-Origin", webOrigin);
      res.set("Vary", "Origin");
    }
    next();
  };
  routes.options("/uploads/:assetId", cors, (req, res) => {
    res.set("Access-Control-Allow-Methods", "PUT");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "600");
    res.status(204).end();
  });
  routes.put("/uploads/:assetId", cors, async (req, res) => {
    const { assetId } = req.params;
    const token = String(req.query.token ?? "");
    const asset = mongoose.isValidObjectId(assetId)
      ? await store.Asset.findById(assetId)
      : null;
    // One answer for every bad link, so it tells a guesser nothing.
    if (
      !asset ||
      !asset.tokenHash ||
      asset.tokenHash !== hash(token) ||
      asset.expiresAt <= now()
    )
      throw new HttpError(
        403,
        "upload_link_invalid",
        "This upload link is not valid.",
      );
    if (asset.status !== "waiting_for_upload")
      throw conflict("already_uploaded", "This file was already sent.");
    if (req.get("content-type") !== asset.contentType)
      throw badRequest(`Send the file with Content-Type ${asset.contentType}.`);
    if (Number(req.get("content-length")) > asset.sizeBytes)
      throw badRequest("The file is bigger than you said.");

    const target = paths.upload(assetId);
    await mkdir(path.dirname(target), { recursive: true });
    let bytes = 0;
    try {
      await pipeline(
        req,
        async function* limit(chunks) {
          for await (const chunk of chunks) {
            bytes += chunk.length;
            if (bytes > asset.sizeBytes)
              throw badRequest("The file is bigger than you said.");
            yield chunk;
          }
        },
        createWriteStream(target),
      );
    } catch (error) {
      await rm(target, { force: true });
      throw error;
    }
    if (bytes === 0) {
      await rm(target, { force: true });
      throw badRequest("The file is empty.");
    }
    await store.Asset.updateOne(
      { _id: asset._id },
      { $set: { uploadedAt: now() } },
    );
    res.status(204).end();
  });
  return routes;
}

/** The routes in openapi.yaml. The spec has already checked role and body. */
export function mediaRoutes({ store, view, processAsset, uploadsUrl, now }) {
  const routes = express.Router();

  // Family see only their own files. A stranger's ID looks missing.
  async function findOwn(assetId, user) {
    const asset = await store.Asset.findById(assetId);
    if (!asset || (user.role !== "admin" && asset.ownerId !== user.id))
      throw notFound();
    return asset;
  }

  routes.post("/media/uploads", async (req, res) => {
    const { kind, contentType, sizeBytes } = req.body;
    const type = isPhoto(kind) ? "photo" : "video";
    if (!contentType.startsWith(type === "photo" ? "image/" : "video/"))
      throw badRequest(`A ${kind} must be a ${type} file.`);
    if (sizeBytes > MAX_BYTES[type])
      throw badRequest(
        type === "photo"
          ? "Photos can be up to 15 MB."
          : "Videos can be up to 500 MB.",
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now().getTime() + UPLOAD_MS);
    const asset = await store.Asset.create({
      kind,
      status: "waiting_for_upload",
      ownerId: req.user.id,
      contentType,
      sizeBytes,
      tokenHash: hash(token),
      expiresAt,
      createdAt: now(),
    });
    const id = asset._id.toString();
    res.status(201).json({
      assetId: id,
      uploadUrl: `${uploadsUrl.replace(/\/+$/, "")}/${id}?token=${token}`,
      headers: { "Content-Type": contentType },
      expiresAt: expiresAt.toISOString(),
    });
  });

  routes.post("/media/uploads/:assetId/complete", async (req, res) => {
    const asset = await findOwn(req.params.assetId, req.user);
    if (asset.status !== "waiting_for_upload")
      throw conflict("already_completed", "This file is already done.");
    if (!asset.uploadedAt)
      throw conflict("not_uploaded", "Upload the file first.");
    // Only one complete call wins.
    const claimed = await store.Asset.findOneAndUpdate(
      { _id: asset._id, status: "waiting_for_upload" },
      { $set: { status: "processing" }, $unset: { tokenHash: 1 } },
      { returnDocument: "after" },
    );
    if (!claimed)
      throw conflict("already_completed", "This file is already done.");
    processAsset(claimed);
    res.status(202).json(view(claimed));
  });

  routes.get("/media/assets/:assetId", async (req, res) => {
    res.json(view(await findOwn(req.params.assetId, req.user)));
  });

  return routes;
}

/**
 * The media service's Express app.
 * @param {object} options
 * @param {string} options.dir Folder for uploads and ready files.
 * @param {string} options.publicUrl This service's address as browsers see it.
 */
export function createMediaApp({
  store,
  dir,
  publicUrl,
  webOrigin,
  processAsset,
  verifyToken,
  logger,
  ready,
  now = () => new Date(),
  validateResponses = false,
}) {
  const paths = mediaPaths(dir);
  const base = publicUrl.replace(/\/+$/, "");
  return createApp({
    service: "media",
    logger,
    before: [fileRoutes({ store, paths, webOrigin, now })],
    routes: mediaRoutes({
      store,
      view: createView(`${base}/files`),
      processAsset,
      uploadsUrl: `${base}/uploads`,
      now,
    }),
    auth: { verifyToken },
    ready,
    validateResponses,
  });
}
