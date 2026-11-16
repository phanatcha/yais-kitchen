import { useEffect, useState } from "react";
import { Link } from "react-router";
import clockIcon from "../../assets/icon-clock.svg";
import ui from "../../styles/ui.module.css";
import styles from "./HoldTimer.module.css";

/**
 * How long the seats stay held (the hold's or the unpaid booking's
 * `expiresAt`). Once it runs out, booking gives the seats back, so the
 * guest is sent to pick a time again.
 */
export default function HoldTimer({ expiresAt, classId }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - now;

  if (left <= 0) {
    return (
      <p className={ui.notice} role="alert">
        Time ran out, so we let your seats go.{" "}
        <Link className={ui.link} to={`/classes/${classId}/book`}>
          Pick a time again
        </Link>
      </p>
    );
  }

  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const time =
    hours > 0
      ? `${hours} h ${String(minutes).padStart(2, "0")} min`
      : `${minutes}:${seconds}`;
  return (
    <p className={styles.timer} role="timer">
      <img src={clockIcon} alt="" width="24" height="24" />
      We are holding your seats for {time} more.
    </p>
  );
}
