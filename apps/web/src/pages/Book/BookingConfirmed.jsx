import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import BookingSteps from "../../components/booking/BookingSteps.jsx";
import BookingSummary from "../../components/booking/BookingSummary.jsx";
import PageTitle from "../../components/PageTitle.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import sparkle from "../../assets/sparkle.svg";
import sparkleCoral from "../../assets/sparkle-coral.svg";
import zigzag from "../../assets/zigzag-underline.svg";
import { bookingKey, useBooking } from "../../lib/booking.js";
import { clearCheckout } from "../../lib/checkout.js";
import { formatThaiLongDate, formatThaiTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./BookingConfirmed.module.css";

export default function BookingConfirmed() {
  const { bookingId } = useParams();
  const query = useBooking(bookingId, { pollWhilePending: true });
  const status = query.data?.status;

  // The booking is done, so the next booking starts fresh.
  useEffect(() => {
    if (status === "confirmed") clearCheckout();
  }, [status]);

  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.layout}`}>
        <div className={styles.steps}>
          <BookingSteps current={4} />
        </div>
        <Body query={query} bookingId={bookingId} />
      </div>
    </div>
  );
}

function Body({ query, bookingId }) {
  const queryClient = useQueryClient();
  const updates =
    queryClient.getQueryState(bookingKey(bookingId))?.dataUpdateCount ?? 0;

  if (query.isPending) {
    return (
      <div className={styles.main}>
        <Loading label="Loading your booking…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={styles.main}>
        <ErrorNotice error={query.error} />
      </div>
    );
  }

  const booking = query.data;
  const isConfirmed =
    booking.status === "confirmed" || booking.status === "completed";
  const isPending = booking.status === "pending_payment";
  // useBooking polls up to 15 times; after that, say it may take longer.
  const stillPolling = isPending && updates < 15;
  const time = formatThaiTime(booking.startsAt);
  const day = formatThaiLongDate(booking.startsAt);

  return (
    <>
      <div className={styles.main}>
        {isConfirmed ? (
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroMain}>See you in</span>{" "}
              <span className={styles.heroScript}>the kitchen</span>
            </h1>
            <img
              className={styles.zigzag}
              src={zigzag}
              alt=""
              width="440"
              height="38"
            />
            <img
              className={styles.sparkleBig}
              src={sparkle}
              alt=""
              width="72"
              height="72"
            />
            <img
              className={styles.sparkleSmall}
              src={sparkleCoral}
              alt=""
              width="28"
              height="28"
            />
          </div>
        ) : (
          <PageTitle
            main={isPending ? "Almost" : "Booking"}
            script={isPending ? "there" : booking.status}
          />
        )}

        <div role="status" className={styles.status}>
          {isConfirmed && (
            <p className={ui.bodyLarge}>
              You are booked with {booking.class.yaiName} on {day} at {time}{" "}
              Thailand time.
            </p>
          )}
          {isPending && (
            <p className={ui.notice}>
              {stillPolling
                ? "We're confirming your payment. This takes a few seconds."
                : "Your payment is still being confirmed. We'll email you as soon as it's done."}
            </p>
          )}
          {(booking.status === "cancelled" || booking.status === "expired") && (
            <p className={ui.notice}>
              This booking was {booking.status}. No money was taken for it.
            </p>
          )}
        </div>

        {isConfirmed && (
          <dl className={styles.timeline}>
            <dt>Today</dt>
            <dd>We email you the ingredient list.</dd>
            <dt>Before class</dt>
            <dd>Set up your kitchen and your phone or laptop.</dd>
            <dt>At {time}</dt>
            <dd>Join the live class. Your Yai and helper are ready for you.</dd>
          </dl>
        )}

        <div className={styles.actions}>
          {isConfirmed && (
            <Link className={ui.primary} to={`/my-classes/${bookingId}/ready`}>
              Get ready for your class
            </Link>
          )}
          <Link className={ui.outline} to="/my-classes">
            See my classes
          </Link>
        </div>
      </div>

      <aside className={styles.side}>
        <BookingSummary
          classInfo={booking.class}
          startsAt={booking.startsAt}
          guests={booking.guests}
          total={booking.total}
        />
      </aside>
    </>
  );
}
