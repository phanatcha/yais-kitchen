import mongoose from "mongoose";
export function createStore(connection) {
  const model = (name, fields) =>
    connection.model(
      name,
      new mongoose.Schema(fields, { timestamps: true, versionKey: false }),
    );
  const store = {
    Payment: model("Payment", {
      _id: String,
      bookingId: { type: String, unique: true },
      holdId: String,
      userId: String,
      guestSessionId: String,
      stripePaymentIntentId: { type: String, unique: true, sparse: true },
      amount: Number,
      currency: String,
      method: String,
      status: String,
      refundedAt: Date,
    }),
    Refund: model("Refund", {
      _id: String,
      paymentId: { type: String, unique: true },
      bookingId: String,
      stripeRefundId: { type: String, unique: true, sparse: true },
      amount: Number,
      status: String,
      reason: String,
      history: [mongoose.Schema.Types.Mixed],
    }),
    WebhookEvent: model("WebhookEvent", {
      _id: String,
      eventType: String,
      processingStatus: String,
      processedAt: Date,
      retryCount: Number,
    }),
  };
  store.init = () =>
    Promise.all(
      Object.values(store)
        .filter((x) => x?.init)
        .map((x) => x.init()),
    );
  return store;
}
