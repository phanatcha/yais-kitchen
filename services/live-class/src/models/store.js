import mongoose from "mongoose";
export function createStore(connection) {
  const schema = new mongoose.Schema(
    {
      _id: String,
      room: String,
      version: { type: Number, default: 0 },
      step: { type: Number, default: 0 },
      total: Number,
      endedAt: Date,
      recording: { type: String, default: "off" },
      egressId: String,
      joinTicketsExpireAt: Date,
      objectKey: String,
      deleteAfter: Date,
      participants: { type: [mongoose.Schema.Types.Mixed], default: [] },
      consentAudit: [mongoose.Schema.Types.Mixed],
      captions: [mongoose.Schema.Types.Mixed],
    },
    { timestamps: true, versionKey: false },
  );
  const Session = connection.model("LiveSession", schema);
  return { Session, init: () => Session.init() };
}
