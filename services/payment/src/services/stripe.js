import Stripe from "stripe";
import { conflict } from "@yais-kitchen/shared";

export function createStripeProvider({
  secretKey,
  webhookSecret,
  promptpayEnabled = false,
}) {
  if (!secretKey?.startsWith("sk_test_"))
    throw new Error("STRIPE_SECRET_KEY must be a test-mode key.");
  const stripe = new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 10000,
  });
  return {
    verify: (raw, signature) =>
      stripe.webhooks.constructEvent(raw, signature, webhookSecret),
    async methods() {
      const methods = ["card"];
      if (promptpayEnabled) {
        const account = await stripe.accounts.retrieve();
        if (account.capabilities?.promptpay_payments === "active")
          methods.push("promptpay");
      }
      return methods;
    },
    async create(payment) {
      if (!(await this.methods()).includes(payment.method))
        throw conflict(
          "method_unavailable",
          "This payment method is unavailable for this account.",
        );
      return stripe.paymentIntents.create(
        {
          amount: payment.amount,
          currency: "thb",
          payment_method_types: [payment.method],
          metadata: { paymentId: payment._id, bookingId: payment.bookingId },
        },
        { idempotencyKey: `payment:${payment._id}` },
      );
    },
    retrieve: (intentId) => stripe.paymentIntents.retrieve(intentId),
    refund: (payment, refund) =>
      stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: refund.amount,
          metadata: { refundId: refund._id },
        },
        { idempotencyKey: `refund:${refund._id}` },
      ),
  };
}
