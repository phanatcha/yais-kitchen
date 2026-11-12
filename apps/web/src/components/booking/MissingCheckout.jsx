import { Link } from "react-router";
import ui from "../../styles/ui.module.css";

/** Shown on Your Details and Payment when no seats are held in this tab. */
export default function MissingCheckout({ classId }) {
  return (
    <div className={ui.page}>
      <div className={ui.inner}>
        <p className={ui.notice} role="alert">
          We couldn&apos;t find a booking in progress in this tab. Seats are
          held for 10 minutes.{" "}
          <Link
            className={ui.link}
            to={classId ? `/classes/${classId}/book` : "/"}
          >
            Pick a time again
          </Link>
        </p>
      </div>
    </div>
  );
}
