import { useId, useState } from "react";
import FamilyPage from "../../components/family/FamilyPage.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { errorText } from "../../lib/errors.js";
import {
  formatClassTime,
  formatDayKey,
  formatThaiTime,
  thaiDateKey,
} from "../../lib/format.js";
import {
  useAddAvailableTime,
  useAvailableTimes,
  useDeleteAvailableTime,
} from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import styles from "./FamilyTimes.module.css";

const MAX_HOURS = 8;

/** "2026-12-01" + "10:00" in Thailand (UTC+7, no daylight saving) → ISO in UTC. */
function thaiToIso(date, time) {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

/** FR-34: the family adds and removes times their Yai can teach. */
export default function FamilyTimes() {
  return (
    <FamilyPage
      titleMain="When Yai"
      titleScript="can teach"
      lead="Add the times your Yai is free to teach. Admin turns them into classes guests can book."
    >
      {(yaiId) => <Times yaiId={yaiId} />}
    </FamilyPage>
  );
}

function Times({ yaiId }) {
  const query = useAvailableTimes(yaiId);
  const remove = useDeleteAvailableTime(yaiId);

  let list;
  if (query.isPending) list = <Loading />;
  else if (query.isError) list = <ErrorNotice error={query.error} />;
  else if (query.data.items.length === 0) {
    list = <p className={ui.notice}>No times yet. Add the first one above.</p>;
  } else {
    list = (
      <ul className={staff.list}>
        {query.data.items.map((t) => {
          const local = formatClassTime(t.startsAt).local;
          return (
            <li key={t.id} className={`${ui.card} ${staff.row}`}>
              <div className={staff.rowInfo}>
                <span
                  className={`${staff.statusTag} ${t.isUsed ? staff.pandan : staff.turmeric}`}
                >
                  {t.isUsed ? "Booked into a class" : "Open"}
                </span>
                <h3 className={ui.h3}>
                  {formatDayKey(thaiDateKey(t.startsAt))},{" "}
                  {formatThaiTime(t.startsAt)}–{formatThaiTime(t.endsAt)}
                </h3>
                <p className={ui.small}>Thailand time. Your time: {local}</p>
              </div>
              <div className={staff.rowActions}>
                {t.isUsed ? (
                  <p className={ui.small}>
                    Ask Admin to change a time that is already a class.
                  </p>
                ) : (
                  <button
                    type="button"
                    className={ui.outline}
                    onClick={() => remove.mutate(t.id)}
                    disabled={remove.isPending}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <AddTimeForm yaiId={yaiId} />
      <section className={staff.section}>
        <h2 className={ui.h3}>Times you have added</h2>
        {remove.error && (
          <p className={ui.error} role="alert">
            {errorText(remove.error)}
          </p>
        )}
        {list}
      </section>
    </>
  );
}

function AddTimeForm({ yaiId }) {
  const add = useAddAvailableTime(yaiId);
  const [today] = useState(() => thaiDateKey(new Date().toISOString()));
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("");

  const dateId = useId();
  const startsId = useId();
  const endsId = useId();
  const hintId = useId();
  const errorId = useId();

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    const startsAt = thaiToIso(date, starts);
    const endsAt = thaiToIso(date, ends);
    const hours = (new Date(endsAt) - new Date(startsAt)) / 3_600_000;
    if (hours <= 0) {
      setFormError("The end time must be after the start time.");
      return;
    }
    if (hours > MAX_HOURS) {
      setFormError(`A time can last at most ${MAX_HOURS} hours.`);
      return;
    }
    if (new Date(startsAt).getTime() <= Date.now()) {
      setFormError("Pick a time in the future.");
      return;
    }
    setFormError("");
    add.mutate(
      { startsAt, endsAt },
      {
        onSuccess: () => {
          setStatus(
            `Added ${formatDayKey(date)}, ${starts}–${ends} Thailand time.`,
          );
          setStarts("");
          setEnds("");
        },
      },
    );
  }

  const shownError = formError || errorText(add.error);

  return (
    <form
      className={`${ui.card} ${styles.form}`}
      onSubmit={handleSubmit}
      aria-describedby={shownError ? errorId : undefined}
    >
      <h2 className={ui.h3}>Add a time</h2>
      <p id={hintId} className={ui.body}>
        All times are in Thailand time. One time can last up to {MAX_HOURS}{" "}
        hours.
      </p>
      <div className={styles.fields}>
        <div className={ui.field}>
          <label htmlFor={dateId} className={ui.label}>
            Date
          </label>
          <input
            id={dateId}
            className={ui.input}
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className={ui.field}>
          <label htmlFor={startsId} className={ui.label}>
            Starts (Thailand time)
          </label>
          <input
            id={startsId}
            className={ui.input}
            type="time"
            required
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            aria-describedby={hintId}
          />
        </div>
        <div className={ui.field}>
          <label htmlFor={endsId} className={ui.label}>
            Ends (Thailand time)
          </label>
          <input
            id={endsId}
            className={ui.input}
            type="time"
            required
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            aria-describedby={hintId}
          />
        </div>
        <button
          type="submit"
          className={`${ui.primary} ${styles.submit}`}
          disabled={add.isPending}
        >
          {add.isPending ? "Adding…" : "Add time"}
        </button>
      </div>
      {shownError && (
        <p id={errorId} className={ui.error} role="alert">
          {shownError}
        </p>
      )}
      <p className={ui.body} role="status">
        {status}
      </p>
    </form>
  );
}
