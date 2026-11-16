import { useState } from "react";
import { Link, useNavigate } from "react-router";
import PageTitle from "../../components/PageTitle.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import starIcon from "../../assets/icon-star.svg";
import { ApiError } from "../../lib/api.js";
import { useDeleteAccount, useMe, useSignOut } from "../../lib/auth.js";
import { useBookingPages, useCancelBooking } from "../../lib/booking.js";
import { readCheckout } from "../../lib/checkout.js";
import { errorText } from "../../lib/errors.js";
import {
  formatTHB,
  formatThaiLongDate,
  formatThaiTime,
} from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./MyClasses.module.css";

const DAY = 24 * 60 * 60 * 1000;

/** "In 2 days", "Tomorrow", "Today" */
/** What happened to the money of a cancelled booking. */
function refundLine(booking) {
  if (booking.status === "refunded" || booking.refundStatus === "succeeded") {
    return "This class was cancelled and your money was refunded.";
  }
  if (booking.refundStatus === "failed") {
    return "This class was cancelled. Your refund is delayed, and we are looking into it.";
  }
  if (booking.refundStatus === "pending") {
    return "This class was cancelled. Your refund is on its way.";
  }
  return "This class was cancelled.";
}

function countdownLabel(startsAt, now) {
  const days = Math.ceil((new Date(startsAt).getTime() - now) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function MyClasses() {
  const navigate = useNavigate();
  const me = useMe();
  const signOut = useSignOut();
  const signedIn = me.isSuccess;
  const upcoming = useBookingPages({ when: "upcoming" }, { enabled: signedIn });
  const past = useBookingPages({ when: "past" }, { enabled: signedIn });
  const [now] = useState(() => Date.now());
  const [deleted, setDeleted] = useState(false);

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSettled: () => navigate("/sign-in", { replace: true }),
    });
  }

  let body;
  if (deleted) {
    body = (
      <p className={ui.notice} role="status">
        Your account is deleted. Thank you for cooking with us.{" "}
        <Link className={ui.link} to="/">
          Back to home
        </Link>
      </p>
    );
  } else if (me.isPending) {
    body = <Loading label="Loading your classes…" />;
  } else if (
    me.isError &&
    me.error instanceof ApiError &&
    [401, 403].includes(me.error.status)
  ) {
    body = (
      <p className={ui.notice} role="alert">
        Sign in with a code from your email to see your classes.{" "}
        <Link className={ui.link} to="/sign-in" state={{ from: "/my-classes" }}>
          Sign in
        </Link>
      </p>
    );
  } else if (me.isError) {
    body = <ErrorNotice error={me.error} />;
  } else {
    body = (
      <>
        <p className={`${ui.bodyLarge} ${styles.signedIn}`}>
          Signed in as {me.data.email}.{" "}
          <button type="button" className={ui.link} onClick={handleSignOut}>
            Sign out
          </button>
        </p>

        <Section title="Coming up" query={upcoming}>
          {(booking, i) => (
            <UpcomingRow
              key={booking.id}
              booking={booking}
              index={i}
              now={now}
            />
          )}
        </Section>
        <Section title="Past classes" query={past}>
          {(booking, i) => (
            <PastRow key={booking.id} booking={booking} index={i + 2} />
          )}
        </Section>
        {me.data.role === "tourist" && (
          <DeleteAccount onDeleted={() => setDeleted(true)} />
        )}
      </>
    );
  }

  return (
    <div className={ui.page}>
      <div className={ui.inner}>
        {[...upcoming.items, ...past.items].some((b) => b.class.isSample) && (
          <p className={`${ui.tag} ${styles.tag}`}>Sample classes</p>
        )}
        <PageTitle main="My" script="classes" className={styles.title} />
        {body}
      </div>
    </div>
  );
}

function Section({ title, query, children }) {
  let content;
  if (query.isPending) content = <Loading />;
  else if (query.isError) content = <ErrorNotice error={query.error} />;
  else if (query.items.length === 0) {
    content = (
      <p className={ui.notice}>
        {title === "Coming up" ? (
          <>
            No classes coming up.{" "}
            <Link className={ui.link} to="/">
              Find your Yai
            </Link>
          </>
        ) : (
          "Classes you have finished show up here, with their recipe cards."
        )}
      </p>
    );
  } else {
    content = (
      <>
        <ul className={styles.list}>{query.items.map(children)}</ul>
        {query.hasNextPage && (
          <button
            type="button"
            className={`${ui.outline} ${styles.more}`}
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        )}
      </>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={ui.h3}>{title}</h2>
      {content}
    </section>
  );
}

function Row({ booking, index, tag, tagClass, lines, actions }) {
  return (
    <li className={`${ui.card} ${styles.row}`}>
      <PhotoSlot
        label={booking.class.dish}
        photo={booking.class.photo}
        sizes="240px"
        tone={index}
        className={styles.photo}
      />
      <div className={styles.info}>
        <span className={`${styles.statusTag} ${tagClass}`}>{tag}</span>
        <h3 className={ui.h3}>
          {booking.class.dish} with {booking.class.yaiName}
        </h3>
        {lines.map((line) => (
          <p key={line} className={ui.body}>
            {line}
          </p>
        ))}
      </div>
      <div className={styles.actions}>{actions}</div>
    </li>
  );
}

function UpcomingRow({ booking, index, now }) {
  const when = `${formatThaiLongDate(booking.startsAt)}, ${formatThaiTime(booking.startsAt)} Thailand time`;
  const joinOpen =
    now >= new Date(booking.joinOpensAt).getTime() &&
    now < new Date(booking.endsAt).getTime();

  let tag = countdownLabel(booking.startsAt, now);
  let tagClass = styles.turmeric;
  if (booking.status === "pending_payment") {
    tag = "Waiting for payment";
    tagClass = styles.outlined;
  } else if (booking.status === "cancelled") {
    tag = "Cancelled";
    tagClass = styles.outlined;
  }

  return (
    <Row
      booking={booking}
      index={index}
      tag={tag}
      tagClass={tagClass}
      lines={[
        when,
        booking.status === "cancelled"
          ? refundLine(booking)
          : `About ${booking.class.durationMinutes} minutes. A helper interprets for you.`,
      ]}
      actions={
        booking.status === "pending_payment" ? (
          <PendingActions bookingId={booking.id} />
        ) : booking.status === "cancelled" ? null : (
          <>
            {joinOpen ? (
              <Link
                className={ui.primary}
                to={`/my-classes/${booking.id}/live`}
              >
                Join class
              </Link>
            ) : (
              <Link
                className={ui.primary}
                to={`/my-classes/${booking.id}/ready`}
              >
                Get ready
              </Link>
            )}
            <p className={ui.small}>Join opens 10 minutes before</p>
            {booking.status === "confirmed" && (
              <CancelBooking booking={booking} now={now} />
            )}
          </>
        )
      }
    />
  );
}

/**
 * Cancelling with a full refund, until `cancellableUntil` (48 hours before
 * class). It asks once more first, because a cancelled seat may go to
 * someone else.
 */
function CancelBooking({ booking, now }) {
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const until = booking.cancellableUntil;
  const untilText = `${formatThaiLongDate(until)}, ${formatThaiTime(until)}`;

  if (now >= new Date(until).getTime()) {
    return <p className={ui.small}>Cancelling closed on {untilText}.</p>;
  }
  if (!confirming) {
    return (
      <>
        <button
          type="button"
          className={`${ui.link} ${styles.cancel}`}
          onClick={() => setConfirming(true)}
        >
          Cancel booking
        </button>
        <p className={ui.small}>Full refund until {untilText} Thailand time.</p>
      </>
    );
  }
  return (
    <div className={styles.confirm} role="group" aria-label="Cancel booking">
      <p className={ui.body}>
        Cancel and get {formatTHB(booking.total.amount)} back?
      </p>
      <div className={styles.confirmButtons}>
        <button
          type="button"
          className={ui.primary}
          onClick={() => cancel.mutate(booking.id)}
          disabled={cancel.isPending}
        >
          {cancel.isPending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          className={ui.outline}
          onClick={() => setConfirming(false)}
          disabled={cancel.isPending}
        >
          Keep it
        </button>
      </div>
      {cancel.error && (
        <p className={ui.error} role="alert">
          {errorText(cancel.error)}
        </p>
      )}
    </div>
  );
}

/** Deleting the account, at the end of the page, after one more ask. */
function DeleteAccount({ onDeleted }) {
  const remove = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className={styles.section} aria-labelledby="account-heading">
      <h2 id="account-heading" className={ui.h3}>
        Your account
      </h2>
      <p className={ui.body}>
        You can delete your account and the details we keep about you. Bookings
        you paid for stay in our records for accounting.
      </p>
      {confirming ? (
        <div className={styles.confirm}>
          <p className={ui.body}>
            Delete your account? This can&apos;t be undone.
          </p>
          <div className={styles.confirmButtons}>
            <button
              type="button"
              className={ui.primary}
              onClick={() => remove.mutate(undefined, { onSuccess: onDeleted })}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Yes, delete it"}
            </button>
            <button
              type="button"
              className={ui.outline}
              onClick={() => setConfirming(false)}
              disabled={remove.isPending}
            >
              Keep my account
            </button>
          </div>
          {remove.error && (
            <p className={ui.error} role="alert">
              {errorText(remove.error)}
            </p>
          )}
        </div>
      ) : (
        <div>
          <button
            type="button"
            className={ui.outline}
            onClick={() => setConfirming(true)}
          >
            Delete my account
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Not paid yet, so nothing to get ready for. The checkout lives in the tab
 * that started it, so only that tab can go back to Payment.
 */
function PendingActions({ bookingId }) {
  const [inThisTab] = useState(() => readCheckout().booking?.id === bookingId);
  return (
    <>
      {inThisTab && (
        <Link className={ui.primary} to="/book/payment">
          Finish paying
        </Link>
      )}
      <p className={ui.small}>
        We&apos;ll confirm this class once your payment goes through.
      </p>
    </>
  );
}

function PastRow({ booking, index }) {
  const finished = booking.status === "completed";
  return (
    <Row
      booking={booking}
      index={index}
      tag={finished ? "Finished" : "Cancelled"}
      tagClass={finished ? styles.pandan : styles.outlined}
      lines={[
        formatThaiLongDate(booking.startsAt),
        finished ? "Your recipe card is saved here." : refundLine(booking),
      ]}
      actions={
        finished && (
          <div className={styles.pastActions}>
            <Link className={ui.outline} to={`/my-classes/${booking.id}/after`}>
              Recipe card
            </Link>
            {booking.isRated ? (
              <p className={styles.rated}>
                <img src={starIcon} alt="" width="22" height="22" />
                You rated this class
              </p>
            ) : (
              <Link
                className={ui.turmeric}
                to={`/my-classes/${booking.id}/after#rate`}
              >
                Rate class
              </Link>
            )}
          </div>
        )
      }
    />
  );
}
