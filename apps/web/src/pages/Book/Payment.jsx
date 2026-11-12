import { useId, useState } from "react";
import { useNavigate } from "react-router";
import BookingLayout from "../../components/booking/BookingLayout.jsx";
import BookingSummary from "../../components/booking/BookingSummary.jsx";
import MissingCheckout from "../../components/booking/MissingCheckout.jsx";
import { useCreatePaymentIntent } from "../../lib/booking.js";
import { readCheckout } from "../../lib/checkout.js";
import { errorText } from "../../lib/errors.js";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./Payment.module.css";

const METHODS = [
  { value: "card", label: "Card" },
  { value: "promptpay", label: "PromptPay QR" },
];

export default function Payment() {
  const navigate = useNavigate();
  const [checkout] = useState(readCheckout);
  const createIntent = useCreatePaymentIntent();
  const [method, setMethod] = useState("card");

  const formId = useId();
  const cardId = useId();
  const expiryId = useId();
  const cvcId = useId();
  const errorId = useId();

  const booking = checkout.booking;
  if (!booking || !checkout.classInfo) {
    return <MissingCheckout classId={checkout.classInfo?.id} />;
  }

  function handleSubmit(event) {
    event.preventDefault();
    createIntent.mutate(
      { bookingId: booking.id, method },
      {
        // TODO with Stripe: pass intent.clientSecret to Stripe Elements
        // (confirmPayment) and only then go to Booking Confirmed, which
        // polls the booking until payment confirms it.
        onSuccess: () => navigate(`/book/confirmed/${booking.id}`),
      },
    );
  }

  const total = formatTHB(booking.total.amount);

  return (
    <BookingLayout
      step={3}
      titleMain="How you"
      titleScript="pay"
      side={
        <>
          <BookingSummary
            classInfo={checkout.classInfo}
            startsAt={booking.startsAt ?? checkout.startsAt}
            guests={booking.guests}
            total={booking.total}
          />
          {createIntent.error && (
            <p id={errorId} className={ui.error} role="alert">
              {errorText(createIntent.error)}
            </p>
          )}
          <button
            type="submit"
            form={formId}
            className={`${ui.primary} ${ui.block}`}
            disabled={createIntent.isPending}
          >
            {createIntent.isPending ? "Paying…" : `Pay ${total}`}
          </button>
          <button
            type="button"
            className={`${ui.outline} ${ui.block}`}
            onClick={() => navigate("/book/details")}
          >
            Back
          </button>
        </>
      }
    >
      <p className={styles.prototypeNote}>
        This is only a prototype. Please don&apos;t type real card details. No
        money moves here.
      </p>

      <form
        id={formId}
        className={styles.form}
        onSubmit={handleSubmit}
        aria-describedby={createIntent.error ? errorId : undefined}
      >
        <fieldset className={`${ui.choices} ${styles.methods}`}>
          <legend className={ui.visuallyHidden}>Payment method</legend>
          {METHODS.map((m) => (
            <label key={m.value} className={`${ui.choice} ${styles.method}`}>
              <input
                type="radio"
                name="method"
                className={ui.visuallyHidden}
                value={m.value}
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
              />
              {m.label}
            </label>
          ))}
        </fieldset>

        {method === "card" ? (
          // Stand-ins for Stripe Elements. Nothing typed here is sent anywhere.
          <div className={styles.card}>
            <div className={`${ui.field} ${styles.cardNumber}`}>
              <label htmlFor={cardId} className={ui.label}>
                Card number
              </label>
              <input
                id={cardId}
                className={ui.input}
                inputMode="numeric"
                autoComplete="off"
                placeholder="16 digits"
                maxLength={19}
              />
            </div>
            <div className={ui.field}>
              <label htmlFor={expiryId} className={ui.label}>
                Expiry
              </label>
              <input
                id={expiryId}
                className={ui.input}
                inputMode="numeric"
                autoComplete="off"
                placeholder="MM / YY"
                maxLength={7}
              />
            </div>
            <div className={ui.field}>
              <label htmlFor={cvcId} className={ui.label}>
                Security code
              </label>
              <input
                id={cvcId}
                className={ui.input}
                inputMode="numeric"
                autoComplete="off"
                placeholder="CVC"
                maxLength={4}
              />
            </div>
          </div>
        ) : (
          <p className={ui.notice}>
            After you press Pay, you will scan a PromptPay QR code with your
            banking app.
          </p>
        )}

        <p className={ui.body}>
          Card and PromptPay are planned for a later version.
        </p>
      </form>
    </BookingLayout>
  );
}
