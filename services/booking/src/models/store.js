import mongoose from "mongoose";

export function createStore(connection) {
  const schema = (fields) =>
    new mongoose.Schema(fields, { timestamps: true, versionKey: false });
  const model = (name, fields, indexes = []) => {
    const s = schema(fields);
    for (const [keys, options] of indexes) s.index(keys, options);
    return connection.model(name, s);
  };
  const mixed = mongoose.Schema.Types.Mixed;
  const store = {
    Allocation: model("Allocation", {
      _id: String,
      revision: { type: Number, default: 0 },
      closed: Boolean,
    }),
    Hold: model(
      "Hold",
      {
        _id: String,
        key: { type: String, unique: true },
        classTimeId: String,
        guests: Number,
        expiresAt: Date,
        released: Boolean,
        bookingId: String,
        context: mixed,
      },
      [[{ classTimeId: 1, expiresAt: 1 }, {}]],
    ),
    Booking: model(
      "Booking",
      {
        _id: String,
        holdId: { type: String, unique: true },
        userId: String,
        guestSessionId: String,
        email: String,
        guestName: String,
        classTimeId: String,
        yaiId: String,
        class: mixed,
        guests: Number,
        total: mixed,
        startsAt: Date,
        endsAt: Date,
        expiresAt: Date,
        status: String,
        paymentId: String,
        confirmedAt: Date,
        cancelledAt: Date,
        cancelledBy: String,
        refundStatus: String,
        checkedIngredientIds: [String],
        ingredients: [mixed],
        isRated: { type: Boolean, default: false },
        payoutId: String,
      },
      [
        [{ userId: 1, startsAt: 1 }, {}],
        [{ classTimeId: 1, status: 1 }, {}],
      ],
    ),
    Rating: model("Rating", {
      _id: String,
      bookingId: { type: String, unique: true },
      userId: String,
      classId: String,
      yaiId: String,
      stars: Number,
      highlights: [String],
      comment: String,
    }),
    Payout: model(
      "Payout",
      {
        _id: String,
        yaiId: String,
        periodStart: String,
        periodEnd: String,
        amount: mixed,
        status: String,
        reference: String,
        paidAt: Date,
        bookingIds: [String],
        refundAdjustments: [mixed],
      },
      [[{ yaiId: 1, periodStart: 1, periodEnd: 1 }, { unique: true }]],
    ),
  };
  store.init = () =>
    Promise.all(
      Object.values(store)
        .filter((x) => x?.init)
        .map((x) => x.init()),
    );
  return store;
}
