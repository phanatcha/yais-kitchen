import { formatClassTime, formatTHB } from "../../lib/format.js";
import PhotoSlot from "../PhotoSlot.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./BookingSummary.module.css";

/**
 * Figma "Booking summary" card used on steps 07–10.
 * @param {{ classInfo: object, startsAt?: string, guests?: number, total?: { amount: number } }} props
 */
export default function BookingSummary({
  classInfo,
  startsAt,
  guests = 1,
  total,
  title = "Your class",
}) {
  const when = startsAt ? formatClassTime(startsAt) : null;
  const amount = total?.amount ?? classInfo.price.amount * guests;

  return (
    <section className={`${ui.card} ${styles.summary}`} aria-label={title}>
      <h2 className={ui.h3}>{title}</h2>
      <PhotoSlot
        label={classInfo.photo?.alt ?? classInfo.dish}
        tone="thaiTea"
        className={styles.photo}
      />
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Class</dt>
          <dd>{classInfo.dish}</dd>
        </div>
        <div className={styles.row}>
          <dt>Your Yai</dt>
          <dd>{classInfo.yaiName}</dd>
        </div>
        <div className={styles.row}>
          <dt>When</dt>
          <dd>
            {when ? (
              <>
                {when.thailand}
                <span className={styles.local}>Your time: {when.local}</span>
              </>
            ) : (
              "Pick a time"
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Length</dt>
          <dd>About {classInfo.durationMinutes} minutes</dd>
        </div>
        <div className={styles.row}>
          <dt>Guests</dt>
          <dd>{guests}</dd>
        </div>
        <div className={styles.row}>
          <dt>Helper</dt>
          <dd>Included, interprets for you</dd>
        </div>
        <div className={`${styles.row} ${styles.total}`}>
          <dt>Total</dt>
          <dd>{formatTHB(amount)}</dd>
        </div>
      </dl>
    </section>
  );
}
