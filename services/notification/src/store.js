import mongoose from "mongoose";

const { Schema } = mongoose;

const HOUR_MS = 60 * 60 * 1000;
const DAY_S = 24 * 60 * 60;
const DAY_MS = DAY_S * 1000;

// A reminder stuck in "sending" this long belongs to an instance that died,
// so another one may take it.
const STUCK_MS = 5 * 60 * 1000;

// An email claimed this long ago and still not sent belongs to a copy of the
// event that died. Sending never takes this long, because the mailer gives up
// sooner.
const EMAIL_CLAIM_MS = 60 * 1000;

const DUPLICATE_KEY = 11000;

// When each reminder goes out, and the last moment it still makes sense.
// After that it is skipped, so nobody gets "see you soon" after class.
const REMINDERS = [
  { kind: "24h", before: 24 * HOUR_MS, lastChanceBefore: 2 * HOUR_MS },
  { kind: "1h", before: HOUR_MS, lastChanceBefore: 0 },
];

const options = { versionKey: false };

// Remembered for a month, which covers any redelivery RabbitMQ can make.
const handledEventSchema = new Schema(
  {
    _id: String,
    type: String,
    handledAt: { type: Date, expires: 30 * DAY_S },
  },
  options,
);

// One entry per email, claimed before it is sent. Two copies of one event
// can't both claim it, and a retried event skips what already went out.
// No address or content, so a sign-in code is never stored.
const sentEmailSchema = new Schema(
  {
    _id: String,
    template: String,
    userId: { type: String, index: true },
    status: { type: String, enum: ["sending", "sent"] },
    claimedAt: { type: Date, expires: 90 * DAY_S },
    sentAt: Date,
  },
  options,
);

// What the emails need about a booking. Booking sends it in booking.confirmed,
// so notification never calls booking back.
const bookingSchema = new Schema(
  {
    _id: String,
    userId: { type: String, index: true },
    email: String,
    name: String,
    classTimeId: String,
    classId: String,
    yaiName: String,
    dish: String,
    dishThai: String,
    startsAt: Date,
    endsAt: Date,
    guests: Number,
    total: { _id: false, amount: Number, currency: String },
    ingredients: [
      { _id: false, name: String, nameThai: String, quantity: String },
    ],
    status: { type: String, enum: ["confirmed", "cancelled"] },
    // Gone 90 days after class, as long as a recording can be watched.
    forgetAt: { type: Date, expires: 0 },
  },
  options,
);
bookingSchema.index({ classTimeId: 1, status: 1 });

const reminderSchema = new Schema(
  {
    _id: String,
    bookingId: { type: String, index: true },
    userId: { type: String, index: true },
    kind: { type: String, enum: REMINDERS.map((reminder) => reminder.kind) },
    sendAt: Date,
    lastChanceAt: Date,
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "cancelled", "skipped", "failed"],
    },
    attempts: { type: Number, default: 0 },
    claimedAt: Date,
    // Set once the reminder is finished, and gone 30 days later.
    doneAt: { type: Date, expires: 30 * DAY_S },
  },
  options,
);
reminderSchema.index({ status: 1, sendAt: 1 });

/**
 * Everything notification keeps in MongoDB.
 * @param {import("mongoose").Connection} connection
 * @param {{ now?: () => Date }} [options]
 */
export function createStore(connection, { now = () => new Date() } = {}) {
  const model = (name, schema, collection) =>
    connection.models[name] ?? connection.model(name, schema, collection);
  const HandledEvent = model(
    "HandledEvent",
    handledEventSchema,
    "handled_events",
  );
  const SentEmail = model("SentEmail", sentEmailSchema, "sent_emails");
  const Booking = model("Booking", bookingSchema, "bookings");
  const Reminder = model("Reminder", reminderSchema, "reminders");
  const models = { HandledEvent, SentEmail, Booking, Reminder };

  const forgetAt = (startsAt) =>
    new Date(new Date(startsAt).getTime() + 90 * DAY_MS);

  return {
    models,

    /** Builds the indexes, including the ones that delete old data. */
    init: () => Promise.all(Object.values(models).map((each) => each.init())),

    wasHandled: async (eventId) =>
      (await HandledEvent.exists({ _id: eventId })) !== null,

    markHandled: (event) =>
      HandledEvent.updateOne(
        { _id: event.id },
        { $setOnInsert: { type: event.type, handledAt: now() } },
        { upsert: true },
      ),

    /**
     * Claims an email before it is sent.
     * @returns {Promise<"claimed" | "sent" | "busy">} "sent" if it already
     *   went out, "busy" if another copy of the event is sending it now.
     */
    async claimEmail(key, { template, userId }) {
      try {
        await SentEmail.create({
          _id: key,
          template,
          userId,
          status: "sending",
          claimedAt: now(),
        });
        return "claimed";
      } catch (error) {
        if (error.code !== DUPLICATE_KEY) throw error;
      }
      const takenOver = await SentEmail.updateOne(
        {
          _id: key,
          status: "sending",
          claimedAt: { $lte: new Date(now().getTime() - EMAIL_CLAIM_MS) },
        },
        { $set: { claimedAt: now() } },
      );
      if (takenOver.modifiedCount === 1) return "claimed";
      const existing = await SentEmail.findById(key).lean();
      return existing?.status === "sent" ? "sent" : "busy";
    },

    markSent: (key) =>
      SentEmail.updateOne(
        { _id: key },
        { $set: { status: "sent", sentAt: now() } },
      ),

    /** Lets go of a claim after the email failed, so a retry can send it. */
    releaseEmail: (key) => SentEmail.deleteOne({ _id: key, status: "sending" }),

    /**
     * Saves a confirmed booking. If booking.cancelled got here first, the
     * booking stays cancelled, so no confirmation or reminder goes out.
     */
    saveConfirmedBooking: (data, { dishThai, ingredients = [] } = {}) =>
      Booking.findOneAndUpdate(
        { _id: data.bookingId },
        {
          $set: {
            userId: data.userId,
            email: data.email,
            name: data.name,
            classTimeId: data.classTimeId,
            classId: data.classId,
            yaiName: data.yaiName,
            dish: data.dish,
            dishThai,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            guests: data.guests,
            total: data.total,
            ingredients,
            forgetAt: forgetAt(data.startsAt),
          },
          $setOnInsert: { status: "confirmed" },
        },
        { upsert: true, returnDocument: "after", lean: true },
      ),

    /** Marks the booking cancelled and cancels its reminders. */
    async cancelBooking(data) {
      const booking = await Booking.findOneAndUpdate(
        { _id: data.bookingId },
        {
          $set: {
            status: "cancelled",
            userId: data.userId,
            email: data.email,
            name: data.name,
            classTimeId: data.classTimeId,
            startsAt: data.startsAt,
            forgetAt: forgetAt(data.startsAt),
          },
        },
        { upsert: true, returnDocument: "after", lean: true },
      );
      await Reminder.updateMany(
        { bookingId: data.bookingId, status: { $in: ["pending", "sending"] } },
        { $set: { status: "cancelled", doneAt: now() } },
      );
      return booking;
    },

    /**
     * Plans the reminders that are still ahead, once each.
     * @returns {Promise<string[]>} The kinds planned, such as ["24h", "1h"].
     */
    async planReminders(booking) {
      const startsAt = new Date(booking.startsAt).getTime();
      const ahead = REMINDERS.filter(
        ({ before }) => startsAt - before > now().getTime(),
      );
      for (const { kind, before, lastChanceBefore } of ahead) {
        await Reminder.updateOne(
          { _id: `${booking._id}:${kind}` },
          {
            $setOnInsert: {
              bookingId: booking._id,
              userId: booking.userId,
              kind,
              sendAt: new Date(startsAt - before),
              lastChanceAt: new Date(startsAt - lastChanceBefore),
              status: "pending",
              attempts: 0,
            },
          },
          { upsert: true },
        );
      }
      return ahead.map(({ kind }) => kind);
    },

    /**
     * Takes the next reminder that is due, so no other instance sends it too.
     */
    claimDueReminder() {
      const current = now();
      return Reminder.findOneAndUpdate(
        {
          $or: [
            { status: "pending", sendAt: { $lte: current } },
            {
              status: "sending",
              claimedAt: { $lte: new Date(current.getTime() - STUCK_MS) },
            },
          ],
        },
        {
          $set: { status: "sending", claimedAt: current },
          $inc: { attempts: 1 },
        },
        { sort: { sendAt: 1 }, returnDocument: "after", lean: true },
      );
    },

    finishReminder: (id, status) =>
      Reminder.updateOne(
        { _id: id, status: "sending" },
        { $set: { status, doneAt: now() } },
      ),

    retryReminderLater: (id, delayMs) =>
      Reminder.updateOne(
        { _id: id, status: "sending" },
        {
          $set: {
            status: "pending",
            sendAt: new Date(now().getTime() + delayMs),
          },
        },
      ),

    findBooking: (bookingId) => Booking.findById(bookingId).lean(),

    confirmedBookingsFor: (classTimeId) =>
      Booking.find({ classTimeId, status: "confirmed" })
        .sort({ _id: 1 })
        .lean(),

    /** For user.deleted: removes everything kept about this person. */
    forgetUser: (userId) =>
      Promise.all([
        Booking.deleteMany({ userId }),
        Reminder.deleteMany({ userId }),
        SentEmail.deleteMany({ userId }),
      ]),
  };
}
