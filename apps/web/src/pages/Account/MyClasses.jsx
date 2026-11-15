import { useState } from "react";
import { Link, useNavigate } from "react-router";
import PageTitle from "../../components/PageTitle.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import starIcon from "../../assets/icon-star.svg";
import { ApiError } from "../../lib/api.js";
import { useMe, useSignOut } from "../../lib/auth.js";
import { useBookings } from "../../lib/booking.js";
import { formatThaiLongDate, formatThaiTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./MyClasses.module.css";

const DAY = 24 * 60 * 60 * 1000;

/** "In 2 days", "Tomorrow", "Today" */
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
  const upcoming = useBookings({ when: "upcoming" }, { enabled: signedIn });
  const past = useBookings({ when: "past" }, { enabled: signedIn });
  const [now] = useState(() => Date.now());

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSettled: () => navigate("/sign-in", { replace: true }),
    });
  }

  let body;
  if (me.isPending) {
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
      </>
    );
  }

  return (
    <div className={ui.page}>
      <div className={ui.inner}>
        <p className={`${ui.tag} ${styles.tag}`}>Prototype: sample classes</p>
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
  else if (query.data.items.length === 0) {
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
    content = <ul className={styles.list}>{query.data.items.map(children)}</ul>;
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
        `About ${booking.class.durationMinutes} minutes. A helper interprets for you.`,
      ]}
      actions={
        booking.status === "cancelled" ? null : (
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
          </>
        )
      }
    />
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
        finished
          ? "Your recipe card is saved here."
          : "This class was cancelled and refunded.",
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
