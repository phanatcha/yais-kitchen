import { useId, useState } from "react";
import { Link, useParams } from "react-router";
import PageTitle from "../../components/PageTitle.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import iconCheck from "../../assets/icon-check.svg";
import imageMark from "../../assets/image-mark.svg";
import starEmpty from "../../assets/star-empty.svg";
import starFilled from "../../assets/star-filled.svg";
import {
  useBooking,
  useRateBooking,
  useRecipe,
  useRecordingLink,
} from "../../lib/booking.js";
import { errorText } from "../../lib/errors.js";
import { formatThaiLongDate } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./AfterClass.module.css";

/** Figma "What went well?" chips, mapped to the API's RatingHighlight values. */
const HIGHLIGHTS = [
  { value: "warm_yai", label: "Yai's teaching" },
  { value: "great_helper", label: "The helper" },
  { value: "clear_steps", label: "The recipe" },
  { value: "good_video", label: "Video and sound" },
];

export default function AfterClass() {
  const { bookingId } = useParams();
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;
  const recipeQuery = useRecipe(booking?.class.id);

  if (bookingQuery.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Loading your recipe card…" />
      </div>
    );
  }
  if (bookingQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={bookingQuery.error} />
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.layout}`}>
        <p className={styles.finished}>
          <span className={styles.finishedDot} aria-hidden="true">
            <img src={iconCheck} alt="" width="16" height="16" />
          </span>
          Class finished on {formatThaiLongDate(booking.startsAt)}, after about{" "}
          {booking.class.durationMinutes} minutes
        </p>

        <div className={styles.main}>
          <PageTitle
            main="You made"
            script={booking.class.dish.toLowerCase()}
          />
          <p className={`${ui.bodyLarge} ${styles.lead}`}>
            Here is {booking.class.yaiName}&apos;s recipe to keep, written the
            way she taught it. Then tell us how the class went.
          </p>
          <RecipeCard booking={booking} query={recipeQuery} />
        </div>

        <aside className={styles.side}>
          <RatingForm booking={booking} />
          <Link className={`${ui.outline} ${ui.block}`} to="/my-classes">
            See my classes
          </Link>
        </aside>
      </div>
    </div>
  );
}

function RecipeCard({ booking, query }) {
  const recording = useRecordingLink();

  function openRecording() {
    recording.mutate(booking.classTimeId, {
      onSuccess: (link) => window.open(link.url, "_blank", "noopener"),
    });
  }

  if (query.isPending) return <Loading label="Loading the recipe…" />;
  if (query.isError) {
    return (
      <p className={ui.notice}>
        {query.error?.status === 404
          ? "Your Yai is still writing this recipe card. Check back soon."
          : errorText(query.error)}
      </p>
    );
  }

  const recipe = query.data;
  return (
    <article className={`${ui.card} ${styles.recipe}`}>
      <div className={styles.recipeHeading}>
        <div className={styles.photoCircle}>
          <img src={imageMark} alt="" width="32" height="26" />
          <span>Your bowl</span>
        </div>
        <div className={styles.names}>
          <h2 className={styles.recipeName}>
            {recipe.dish}, Yai&apos;s way{" "}
            <span className={styles.recipeThai} lang="th">
              {recipe.dishThai}
            </span>
          </h2>
          <p className={ui.body}>
            Taught by {booking.class.yaiName} in a class of about{" "}
            {booking.class.durationMinutes} minutes.
          </p>
          <div className={styles.recipeActions}>
            {/* The browser's print dialog can save the card as a PDF. */}
            <button
              type="button"
              className={ui.turmeric}
              onClick={() => window.print()}
            >
              Save as PDF
            </button>
            <button
              type="button"
              className={ui.outline}
              onClick={() => window.print()}
            >
              Print
            </button>
            <button
              type="button"
              className={`${ui.link} ${styles.recordingLink}`}
              onClick={openRecording}
              disabled={recording.isPending}
            >
              Watch the class recording
            </button>
          </div>
          {recording.error && (
            <p className={ui.error} role="alert">
              {errorText(recording.error)}
            </p>
          )}
        </div>
      </div>

      <div className={styles.recipeBody}>
        <section className={styles.ingredients}>
          <h3 className={ui.h3}>Ingredients</h3>
          <ul>
            {recipe.ingredients.map((i) => (
              <li key={i.id}>
                {i.quantity} {i.name.toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.method}>
          <h3 className={ui.h3}>Method</h3>
          <ol>
            {recipe.steps.map((step, i) => (
              <li key={i}>{step.text}</li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.yaiNote && (
        <p className={styles.note}>
          <strong>Yai&apos;s note:</strong> {recipe.yaiNote}
        </p>
      )}
    </article>
  );
}

function RatingForm({ booking }) {
  const rate = useRateBooking(booking.id);
  const [stars, setStars] = useState(0);
  const [highlights, setHighlights] = useState([]);
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");
  const commentId = useId();
  const errorId = useId();

  if (booking.isRated || rate.isSuccess) {
    return (
      <section className={`${ui.card} ${styles.rating}`} id="rate">
        <h2 className={ui.h3}>How was your class?</h2>
        <p className={ui.body} role="status">
          Thank you! Your rating was sent. It helps keep every class safe and
          enjoyable.
        </p>
      </section>
    );
  }

  function toggleHighlight(value) {
    setHighlights((h) =>
      h.includes(value) ? h.filter((v) => v !== value) : [...h, value],
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (stars === 0) {
      setFormError("Pick from 1 to 5 stars first.");
      return;
    }
    setFormError("");
    rate.mutate({
      stars,
      highlights,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
  }

  const shownError = formError || errorText(rate.error);

  return (
    <form
      className={`${ui.card} ${styles.rating}`}
      id="rate"
      onSubmit={handleSubmit}
      aria-describedby={shownError ? errorId : undefined}
    >
      <fieldset className={styles.stars}>
        <legend className={`${ui.h3} ${styles.ratingTitle}`}>
          How was your class?
        </legend>
        <div className={styles.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={styles.star}>
              <input
                type="radio"
                name="stars"
                className={ui.visuallyHidden}
                value={n}
                checked={stars === n}
                onChange={() => {
                  setStars(n);
                  setFormError("");
                }}
              />
              <img
                src={n <= stars ? starFilled : starEmpty}
                alt=""
                width="40"
                height="40"
              />
              <span className={ui.visuallyHidden}>
                {n} {n === 1 ? "star" : "stars"}
              </span>
            </label>
          ))}
          <span className={ui.body} aria-hidden="true">
            {stars ? `${stars} out of 5` : "Tap a star"}
          </span>
        </div>
      </fieldset>

      <fieldset className={`${ui.choices} ${styles.chips}`}>
        <legend className={ui.choicesLegend}>What went well?</legend>
        {HIGHLIGHTS.map((h) => (
          <label key={h.value} className={ui.choice}>
            <input
              type="checkbox"
              className={ui.visuallyHidden}
              checked={highlights.includes(h.value)}
              onChange={() => toggleHighlight(h.value)}
            />
            {h.label}
          </label>
        ))}
      </fieldset>

      <div className={ui.field}>
        <label htmlFor={commentId} className={ui.label}>
          Anything we could do better?
        </label>
        <input
          id={commentId}
          className={ui.input}
          placeholder="Optional"
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {shownError && (
        <p id={errorId} className={ui.error} role="alert">
          {shownError}
        </p>
      )}
      <button
        type="submit"
        className={`${ui.primary} ${ui.block}`}
        disabled={rate.isPending}
      >
        {rate.isPending ? "Sending…" : "Send rating"}
      </button>
      <p className={`${ui.small} ${styles.ratingNote}`}>
        Your rating helps keep every class safe and enjoyable.
      </p>
    </form>
  );
}
