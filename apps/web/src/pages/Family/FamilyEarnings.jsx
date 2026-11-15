import { useState } from "react";
import FamilyPage from "../../components/family/FamilyPage.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { formatDate, formatTHB } from "../../lib/format.js";
import { useEarnings, usePayouts } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import styles from "./FamilyEarnings.module.css";

/** FR-36: what the Yai has earned (75% of each paid booking) and the payouts. */
export default function FamilyEarnings() {
  return (
    <FamilyPage
      titleMain="Yai's"
      titleScript="earnings"
      lead="Your Yai earns 75% of what guests pay, once the class has happened. We pay it every week by PromptPay."
    >
      {(yaiId) => (
        <>
          <Earnings yaiId={yaiId} />
          <Payouts yaiId={yaiId} />
        </>
      )}
    </FamilyPage>
  );
}

function Earnings({ yaiId }) {
  const [groupBy, setGroupBy] = useState("month");
  const query = useEarnings(yaiId, groupBy);

  let content;
  if (query.isPending) content = <Loading />;
  else if (query.isError) content = <ErrorNotice error={query.error} />;
  else if (query.data.rows.length === 0) {
    content = (
      <p className={ui.notice}>Earnings show up after the first class.</p>
    );
  } else {
    const { rows, total } = query.data;
    content = (
      <div className={`${ui.card} ${staff.tableWrap}`}>
        <table className={staff.table}>
          <caption className={ui.visuallyHidden}>Earnings by {groupBy}</caption>
          <thead>
            <tr>
              <th scope="col">{groupBy === "month" ? "Month" : "Class"}</th>
              <th scope="col" className={staff.num}>
                Bookings
              </th>
              <th scope="col" className={staff.num}>
                Yai&apos;s share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td className={staff.num}>{row.bookings}</td>
                <td className={staff.num}>{formatTHB(row.yaiShare.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className={staff.num}>{formatTHB(total.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <section className={staff.section}>
      <div className={styles.headingRow}>
        <h2 className={ui.h3}>What Yai earned</h2>
        <div className={styles.toggle} role="group" aria-label="Group by">
          {[
            ["month", "By month"],
            ["class", "By class"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={ui.outline}
              aria-pressed={groupBy === value}
              onClick={() => setGroupBy(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {content}
    </section>
  );
}

function Payouts({ yaiId }) {
  const query = usePayouts(yaiId);

  let content;
  if (query.isPending) content = <Loading />;
  else if (query.isError) content = <ErrorNotice error={query.error} />;
  else if (query.data.items.length === 0) {
    content = <p className={ui.notice}>No payouts yet.</p>;
  } else {
    content = (
      <div className={`${ui.card} ${staff.tableWrap}`}>
        <table className={staff.table}>
          <caption className={ui.visuallyHidden}>Weekly payouts</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col" className={staff.num}>
                Amount
              </th>
              <th scope="col">Status</th>
              <th scope="col">PromptPay reference</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                </th>
                <td className={staff.num}>{formatTHB(p.amount.amount)}</td>
                <td>
                  <span
                    className={`${staff.statusTag} ${p.status === "paid" ? staff.pandan : staff.turmeric}`}
                  >
                    {p.status === "paid"
                      ? `Paid ${p.paidAt ? formatDate(p.paidAt) : ""}`
                      : "Due"}
                  </span>
                </td>
                <td>{p.status === "paid" ? (p.reference ?? "–") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Payouts</h2>
      {content}
    </section>
  );
}
