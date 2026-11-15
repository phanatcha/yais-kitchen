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
          const isDone = number < current;
          let className = styles.step;
          if (isCurrent) className += ` ${styles.current}`;
          if (isDone) className += ` ${styles.done}`;
          return (
            <li
              key={label}
              className={className}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className={styles.dot} aria-hidden="true">
                {number}
              </span>
              <span className={styles.label}>
                <span className={ui.visuallyHidden}>Step {number}: </span>
                {label}
                {isDone && <span className={ui.visuallyHidden}> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
