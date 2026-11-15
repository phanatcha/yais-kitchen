import FamilyPage from "../../components/family/FamilyPage.jsx";
import PhotoSlot from "../../components/PhotoSlot.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useBookings } from "../../lib/booking.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import styles from "./FamilyBookings.module.css";

const STATUS = {
  pending_payment: ["Waiting for payment", "outlined"],
  confirmed: ["Booked", "turmeric"],
  completed: ["Finished", "pandan"],
  cancelled: ["Cancelled", "outlined"],
  expired: ["Not paid in time", "outlined"],
};

/** FR-35: who booked the Yai's classes. Families see first names only. */
export default function FamilyBookings() {
  return (
    <FamilyPage
      titleMain="Yai's"
      titleScript="bookings"
      lead="Who is coming to cook with your Yai. Guests show by first name only."
    >
      {(yaiId) => (
        <>
          <BookingList yaiId={yaiId} when="upcoming" title="Coming up" />
          <BookingList yaiId={yaiId} when="past" title="Past classes" />
        </>
      )}
    </FamilyPage>
  );
}

function BookingList({ yaiId, when, title }) {
  const query = useBookings({ yaiId, when });

  let content;
  if (query.isPending) content = <Loading />;
  else if (query.isError) content = <ErrorNotice error={query.error} />;
  else if (query.data.items.length === 0) {
    content = (
      <p className={ui.notice}>
        {when === "upcoming"
          ? "No bookings yet. They show up here as soon as a guest pays."
          : "Finished classes show up here."}
      </p>
    );
  } else {
    content = (
      <ul className={staff.list}>
        {query.data.items.map((b, i) => {
          const [label, tone] = STATUS[b.status] ?? [b.status, "outlined"];
          const time = formatClassTime(b.startsAt);
          return (
            <li key={b.id} className={`${ui.card} ${staff.row}`}>
              <PhotoSlot
                label={b.class.dish}
                tone={i + (when === "past" ? 2 : 0)}
                className={styles.photo}
              />
              <div className={staff.rowInfo}>
                <span className={`${staff.statusTag} ${staff[tone]}`}>
                  {label}
                </span>
                <h3 className={ui.h3}>
                  {b.guestName}, {b.guests}{" "}
                  {b.guests === 1 ? "person" : "people"}
                </h3>
                <p className={ui.body}>
                  {b.class.dish}, {time.thailand}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>{title}</h2>
      {content}
    </section>
  );
}
