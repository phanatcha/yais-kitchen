import mongoose from "mongoose";

const { Schema } = mongoose;

export const KINDS = ["photo", "intro_video", "preview_clip", "recipe_video"];
export const STATUSES = [
  "waiting_for_upload",
  "processing",
  "ready",
  "rejected",
];

const assetSchema = new Schema(
  {
    kind: { type: String, required: true, enum: KINDS },
    status: { type: String, required: true, enum: STATUSES },
    // Who asked for the upload. Family see only their own, Admin see all.
    ownerId: { type: String, required: true, index: true },
    contentType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    // The upload link's secret, hashed, and when the link stops working.
    tokenHash: String,
    expiresAt: Date,
    uploadedAt: Date,
    rejectReason: String,
    durationSeconds: Number,
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);
assetSchema.index({ status: 1 });

/** @param {mongoose.Connection} connection */
export function createStore(connection) {
  const Asset = connection.model("Asset", assetSchema);
  return {
    Asset,
    init: () => Asset.init(),
  };
}
