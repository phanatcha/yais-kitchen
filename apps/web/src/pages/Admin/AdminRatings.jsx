import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import starEmpty from "../../assets/star-empty.svg";
import starFilled from "../../assets/star-filled.svg";
import { useAdminYais, useAllClasses, useRatings } from "../../lib/admin.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

/** The After Class chips, worded as guests saw them. */
const HIGHLIGHTS = {
  warm_yai: "Yai's teaching",
  great_helper: "The helper",
  clear_steps: "The recipe",
  good_video: "Video and sound",
  tasty_food: "The food",
};

function Stars({ stars }) {
  return (
    <span className={admin.stars} role="img" aria-label={`${stars} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <img
          key={n}
          src={n <= stars ? starFilled : starEmpty}
          alt=""
          width="24"
          height="24"
        />
      ))}
    </span>
  );
}

/** Guests' ratings after class, part of the evidence that classes are safe and good. */
export default function AdminRatings() {
  const [yaiId, setYaiId] = useState("");
  const ratings = useRatings(yaiId);
  const yais = useAdminYais();
  const classes = useAllClasses();
  const yaiName = Object.fromEntries(yais.items.map((y) => [y.id, y.name]));
  const dish = Object.fromEntries(classes.items.map((c) => [c.id, c.dish]));

  return (
    <AdminPage
      titleMain="Guest"
      titleScript="ratings"
      lead="What guests said after each class. Low ratings are worth a call to the family and the helper."
    >
      <section className={staff.section}>
        <div className={admin.fields}>
          <Field
            label="Yai"
            as="select"
            value={yaiId}
            onChange={(e) => setYaiId(e.target.value)}
          >
            <option value="">Every Yai</option>
            {yais.items.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Field>
        </div>
        <QueryList query={ratings} empty="No ratings yet.">
          {(items) => (
            <ul className={staff.list}>
              {items.map((r) => (
                <li key={r.bookingId} className={`${ui.card} ${staff.row}`}>
                  <div className={staff.rowInfo}>
                    <Stars stars={r.stars} />
                    <h2 className={ui.h3}>
                      {dish[r.classId] ?? "Class"} with{" "}
                      {yaiName[r.yaiId] ?? "her Yai"}
                    </h2>
                    {r.highlights.length > 0 && (
                      <p className={ui.body}>
                        Went well:{" "}
                        {r.highlights.map((h) => HIGHLIGHTS[h] ?? h).join(", ")}
                      </p>
                    )}
                    {r.comment && <p className={ui.body}>“{r.comment}”</p>}
                    <p className={ui.small}>
                      {formatClassTime(r.createdAt).thailand}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryList>
      </section>
    </AdminPage>
  );
}
