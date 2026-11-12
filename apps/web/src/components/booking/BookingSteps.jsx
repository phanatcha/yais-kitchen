import ui from "../../styles/ui.module.css";
import styles from "./BookingSteps.module.css";

const STEPS = ["Pick a time", "Your details", "Payment", "Confirmed"];

/** Figma "Booking steps": 1 Pick a time — 2 Your details — 3 Payment — 4 Confirmed. */
export default function BookingSteps({ current }) {
  return (
    <nav aria-label="Booking progress">
      <ol className={styles.steps}>
        {STEPS.map((label, i) => {
          const number = i + 1;
          const isCurrent = number === current;
          return (
            <li
              key={label}
              className={
                isCurrent ? `${styles.step} ${styles.current}` : styles.step
              }
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className={styles.dot} aria-hidden="true">
                {number}
              </span>
              <span className={styles.label}>
                <span className={ui.visuallyHidden}>Step {number}: </span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
