import { useState } from "react";
import { Link } from "react-router";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import StaffPage from "../../components/StaffPage.jsx";
import { useClass } from "../../lib/booking.js";
import { formatClassTime } from "../../lib/format.js";
import { useClassTimes } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import styles from "./HelperClasses.module.css";

/** FR-32: the class times this helper is assigned to interpret. */
export default function HelperClasses() {
  const query = useClassTimes();
  const [now] = useState(() => Date.now());

  let body;
  if (query.isPending) body = <Loading label="Loading your classes…" />;
  else if (query.isError) body = <ErrorNotice error={query.error} />;
  else if (query.data.items.length === 0) {
    body = (
      <p className={ui.notice}>
        No classes assigned yet. Admin will add you to a class time.
      </p>
    );
  } else {
    body = (
      <ul className={staff.list}>
        {query.data.items.map((classTime, i) => (
          <ClassTimeRow
            key={classTime.id}
            classTime={classTime}
            index={i}
            now={now}
          />
        ))}
      </ul>
    );
  }

  return (
    <StaffPage
      tag="Helper"
      titleMain="Classes to"
      titleScript="interpret"
      lead="Join 10 minutes early, interpret between the Yai and the guests, and move the recipe steps for everyone."
    >
      <section className={staff.section}>
        <h2 className={ui.h3}>Coming up</h2>
        {body}
      </section>
    </StaffPage>
  );
}

function ClassTimeRow({ classTime, index, now }) {
  const classQuery = useClass(classTime.classId);
  const c = classQuery.data;
  const when = formatClassTime(classTime.startsAt);
  const opensAt = new Date(classTime.startsAt).getTime() - 10 * 60 * 1000;
  const open = now >= opensAt && now < new Date(classTime.endsAt).getTime();

  let tag = open ? "Open now" : "Coming up";
  let tagClass = open ? staff.pandan : staff.turmeric;
  if (classTime.status === "cancelled") {
    tag = "Cancelled";
    tagClass = staff.outlined;
  } else if (classTime.status === "draft") {
    tag = "Not published yet";
    tagClass = staff.outlined;
  }

  return (
    <li className={`${ui.card} ${staff.row}`}>
      <PhotoSlot
        label={c?.dish ?? "Class"}
        tone={index}
        className={styles.photo}
      />
      <div className={staff.rowInfo}>
        <span className={`${staff.statusTag} ${tagClass}`}>{tag}</span>
        <h3 className={ui.h3}>
          {c ? `${c.dish} with ${c.yaiName}` : "Loading class…"}
        </h3>
        <p className={ui.body}>{when.thailand}</p>
        <p className={ui.small}>Your time: {when.local}</p>
        <p className={ui.body}>
          Up to {classTime.capacity}{" "}
          {classTime.capacity === 1 ? "guest" : "guests"}
          {c ? `, about ${c.durationMinutes} minutes` : ""}.
        </p>
      </div>
      {classTime.status !== "cancelled" && (
        <div className={staff.rowActions}>
          <Link
            className={ui.primary}
            to={`/helper/classes/${classTime.id}/live`}
          >
            Open live class
          </Link>
        </div>
      )}
    </li>
  );
}
