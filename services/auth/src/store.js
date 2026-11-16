import mongoose from "mongoose";

const { Schema } = mongoose;
const DAY_S = 24 * 60 * 60;
const options = { versionKey: false };

const userSchema = new Schema(
  {
    // Always lower case, so one person can't end up with two accounts.
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["tourist", "family", "helper", "admin"],
    },
    // Family accounts only: the Yai they look after.
    yaiId: String,
    createdAt: { type: Date, required: true },
    // Set when Admin turns the account off. It can't sign in until it is
    // turned back on.
    disabledAt: Date,
  },
  options,
);
userSchema.index({ role: 1, _id: 1 });
userSchema.index({ role: 1, yaiId: 1 });

// One code per email. A new request replaces the old code.
const signInCodeSchema = new Schema(
  {
    _id: String, // the email
    codeHash: { type: String, required: true },
    tries: { type: Number, required: true, default: 0 },
    // Kept a day after it runs out, so a late try hears "expired" rather
    // than "wrong".
    expiresAt: { type: Date, required: true, expires: DAY_S },
  },
  options,
);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    // Only hashes are kept, so a copy of the database can't sign anyone in.
    tokenHash: { type: String, required: true, unique: true },
    previousTokenHash: { type: String, index: true },
    rotatedAt: Date,
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  options,
);

// Who changed what, from every service. Kept for two years.
const auditEntrySchema = new Schema(
  {
    _id: String, // the event ID, so a repeated event is kept once
    service: { type: String, required: true },
    action: { type: String, required: true },
    method: String,
    path: String,
    target: { type: Schema.Types.Mixed, default: {} },
    status: Number,
    actor: {
      _id: false,
      id: { type: String, required: true },
      role: String,
      name: String,
      email: String,
    },
    changes: { type: Schema.Types.Mixed, default: {} },
    requestId: String,
    at: { type: Date, required: true, expires: 2 * 365 * DAY_S },
  },
  { ...options, minimize: false },
);
auditEntrySchema.index({ at: -1, _id: -1 });
auditEntrySchema.index({ "actor.id": 1, at: -1 });
auditEntrySchema.index({ service: 1, at: -1 });

/**
 * The `users`, `sign_in_codes`, `sessions` and `audit_log` collections. Old
 * codes, sessions and audit entries delete themselves.
 * @param {import("mongoose").Connection} connection
 */
export function createStore(connection) {
  const model = (name, schema, collection) =>
    connection.models[name] ?? connection.model(name, schema, collection);

  return {
    User: model("User", userSchema, "users"),
    SignInCode: model("SignInCode", signInCodeSchema, "sign_in_codes"),
    Session: model("Session", sessionSchema, "sessions"),
    AuditEntry: model("AuditEntry", auditEntrySchema, "audit_log"),
    /** Builds the indexes. The unique email index must exist before traffic. */
    async init() {
      await Promise.all(
        Object.values(connection.models).map((m) => m.syncIndexes()),
      );
    },
  };
}
