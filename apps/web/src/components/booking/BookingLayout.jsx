import BookingSteps from "./BookingSteps.jsx";
import PageTitle from "../PageTitle.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./BookingLayout.module.css";

/**
 * The shared frame of Your Details, Payment and Booking Confirmed:
 * steps on top, the form on the left, the summary card and buttons on the right.
 */
export default function BookingLayout({
  step,
  top,
  titleMain,
  titleScript,
  lead,
  side,
  children,
}) {
  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.layout}`}>
        <div className={styles.steps}>
          {step ? <BookingSteps current={step} /> : top}
        </div>
        <div className={styles.main}>
          <PageTitle main={titleMain} script={titleScript} />
          {lead && <p className={`${ui.bodyLarge} ${styles.lead}`}>{lead}</p>}
          {children}
        </div>
        {side && <aside className={styles.side}>{side}</aside>}
      </div>
    </div>
  );
}
