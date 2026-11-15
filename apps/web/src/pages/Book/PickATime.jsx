import { useId, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import BookingSteps from "../../components/booking/BookingSteps.jsx";
import BookingSummary from "../../components/booking/BookingSummary.jsx";
import PageTitle from "../../components/PageTitle.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import monthArrows from "../../assets/month-arrows.svg";
import {
  useBookableTimes,
  useClass,
  useCreateHold,
} from "../../lib/booking.js";
import { saveCheckout } from "../../lib/checkout.js";
import {
  formatDayKey,
  formatMonthKey,
  formatThaiTime,
  thaiDateKey,
} from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./PickATime.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11" + 1 → "2026-12" */
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Day cells for a month grid that starts on Sunday. null pads the first week. */
function monthCells(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

/** Only what later steps need from the class, so the summary survives a reload. */
function classSnapshot(c) {
  return {
    id: c.id,
    dish: c.dish,
    yaiName: c.yaiName,
    price: c.price,
    durationMinutes: c.durationMinutes,
    photo: { alt: c.photo?.alt },
    isSample: c.isSample,
  };
}

export default function PickATime() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const classQuery = useClass(classId);
  const timesQuery = useBookableTimes(classId);
  const createHold = useCreateHold();

  const [todayMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [visibleMonth, setVisibleMonth] = useState(null);
  const [pickedDay, setPickedDay] = useState(null);
  const [classTimeId, setClassTimeId] = useState(null);
  const [guests, setGuests] = useState(1);
  const [formError, setFormError] = useState("");

  const titleId = useId();
  const guestsId = useId();
  const errorId = useId();

  if (classQuery.isPending || timesQuery.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Loading class times…" />
      </div>
    );
  }
  if (classQuery.isError || timesQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={classQuery.error ?? timesQuery.error} />
      </div>
    );
  }

  const classInfo = classQuery.data;
  const times = timesQuery.data.items;

  // Group the times by their day in Thailand.
  const timesByDay = new Map();
  for (const t of times) {
    const key = thaiDateKey(t.startsAt);
    timesByDay.set(key, [...(timesByDay.get(key) ?? []), t]);
  }
  const firstDay = timesByDay.keys().next().value ?? null;

  const month = visibleMonth ?? firstDay?.slice(0, 7) ?? todayMonth;
  const day = pickedDay ?? firstDay;
  const dayTimes = (day && timesByDay.get(day)) ?? [];
  // Until the visitor picks, the first time with seats that day is selected.
  const selected =
    dayTimes.find((t) => t.classTimeId === classTimeId) ??
    dayTimes.find((t) => t.seatsLeft > 0) ??
    null;
  const selectedId = selected?.classTimeId ?? null;
  const maxGuests = Math.max(
    1,
    Math.min(classInfo.maxGuests, selected?.seatsLeft ?? classInfo.maxGuests),
  );
  const guestCount = Math.min(guests, maxGuests);

  function pickDay(key) {
    setPickedDay(key);
    setClassTimeId(null);
    setFormError("");
  }

  function handleContinue() {
    if (!selected) {
      setFormError("Pick a start time first.");
      return;
    }
    setFormError("");
    createHold.mutate(
      { classTimeId: selected.classTimeId, guests: guestCount },
      {
        onSuccess: (hold) => {
          saveCheckout({
            classInfo: classSnapshot(classInfo),
            hold,
            startsAt: selected.startsAt,
            booking: null,
          });
          navigate("/book/details");
        },
      },
    );
  }

  function handleBack() {
    // Go back to the class page if the visitor came from it.
    if (location.key !== "default") navigate(-1);
    else navigate("/");
  }

  const holdError = createHold.error;
  const shownError = formError || (holdError ? holdError.message : "");

  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.layout}`}>
        <div className={styles.steps}>
          <BookingSteps current={1} />
        </div>

        <PageTitle
          id={titleId}
          main="Pick a"
          script="time"
          className={styles.title}
        />

        <section
          className={`${ui.card} ${styles.calendar}`}
          aria-label="Choose a day"
        >
          <div className={styles.monthBar}>
            <h2 className={ui.h3} aria-live="polite">
              {formatMonthKey(month)}
            </h2>
            <div className={styles.arrows}>
              <img src={monthArrows} alt="" width="72" height="24" />
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => setVisibleMonth(shiftMonth(month, -1))}
                aria-label="Previous month"
              />
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => setVisibleMonth(shiftMonth(month, 1))}
                aria-label="Next month"
              />
            </div>
          </div>

          <div className={styles.grid} role="group" aria-label="Days">
            {WEEKDAYS.map((w) => (
              <span key={w} className={styles.weekday} aria-hidden="true">
                {w}
              </span>
            ))}
            {monthCells(month).map((key, i) => {
              if (!key) return <span key={`pad-${i}`} />;
              const count = timesByDay.get(key)?.length ?? 0;
              const isSelected = key === day;
              return (
                <button
                  key={key}
                  type="button"
                  className={
                    isSelected
                      ? `${styles.day} ${styles.daySelected}`
                      : styles.day
                  }
                  disabled={count === 0}
                  aria-pressed={isSelected}
                  aria-label={`${formatDayKey(key)}, ${
                    count === 0
                      ? "no classes"
                      : `${count} start time${count > 1 ? "s" : ""}`
                  }`}
                  onClick={() => pickDay(key)}
                >
                  {Number(key.slice(8))}
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.timesColumn}>
          {day ? (
            <fieldset className={styles.times}>
              <legend className={`${ui.h3} ${styles.legend}`}>
                {formatDayKey(day)}
              </legend>
              <p className={ui.body}>
                Pick a start time. All times are in Thailand time.
              </p>
              <div className={styles.pills}>
                {dayTimes.map((t) => (
                  <label
                    key={t.classTimeId}
                    className={
                      t.classTimeId === selectedId
                        ? `${styles.pill} ${styles.pillSelected}`
                        : styles.pill
                    }
                  >
                    <input
                      type="radio"
                      name="classTime"
                      className={ui.visuallyHidden}
                      value={t.classTimeId}
                      checked={t.classTimeId === selectedId}
                      disabled={t.seatsLeft === 0}
                      onChange={() => {
                        setClassTimeId(t.classTimeId);
                        setFormError("");
                      }}
                      aria-describedby={shownError ? errorId : undefined}
                    />
                    {formatThaiTime(t.startsAt)}
                    <span className={ui.visuallyHidden}>
                      , {t.seatsLeft} seats left
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className={ui.notice}>
              No class times are open yet. Please check back soon.
            </p>
          )}

          <div className={`${ui.field} ${styles.guests}`}>
            <label htmlFor={guestsId} className={ui.label}>
              Guests
            </label>
            <select
              id={guestsId}
              className={ui.input}
              value={guestCount}
              onChange={(e) => setGuests(Number(e.target.value))}
            >
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "person" : "people"}
                </option>
              ))}
            </select>
          </div>

          {classInfo.isSample && (
            <p className={ui.body}>
              These times are samples for our prototype.
            </p>
          )}
        </div>

        <aside className={styles.side}>
          <BookingSummary
            classInfo={classInfo}
            startsAt={selected?.startsAt}
            guests={guestCount}
          />
          {shownError && (
            <p id={errorId} className={ui.error} role="alert">
              {shownError}
            </p>
          )}
          <button
            type="button"
            className={`${ui.primary} ${ui.block}`}
            onClick={handleContinue}
            disabled={createHold.isPending}
          >
            {createHold.isPending ? "Holding your seats…" : "Continue"}
          </button>
          <button
            type="button"
            className={`${ui.outline} ${ui.block}`}
            onClick={handleBack}
          >
            Back to class
          </button>
        </aside>
      </div>
    </div>
  );
}
