import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import { useAuditLog } from "../../lib/admin.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

const AREAS = [
  ["", "Everything"],
  ["catalog", "Yais, classes and sign-ups"],
  ["auth", "Accounts"],
  ["booking", "Bookings and payouts"],
  ["payment", "Payments"],
  ["live-class", "Live classes"],
];

// What each operation in openapi.yaml did, in words.
const ACTIONS = {
  createUser: "Made an account",
  updateUser: "Changed an account",
  retryFailedEvent: "Retried a failed event",
  discardFailedEvent: "Threw away a failed event",
  createYai: "Added a Yai",
  updateYai: "Changed a Yai",
  createClass: "Added a class",
  updateClass: "Changed a class",
  putRecipe: "Saved a recipe",
  addAvailableTime: "Offered a time to teach",
  deleteAvailableTime: "Took back a time to teach",
  createClassTime: "Made a class time",
  updateClassTime: "Changed a class time",
  putFaq: "Saved the help answers",
  updateApplication: "Moved a sign-up",
  deleteApplication: "Deleted a sign-up",
  cancelBooking: "Cancelled a booking",
  createPayout: "Made a payout",
  markPayoutPaid: "Marked a payout paid",
  controlRecording: "Started or stopped a recording",
  endClass: "Ended a live class",
};

const ROLE_NAMES = { admin: "Admin", helper: "Helper", family: "Family" };

/** "status: cancelled · helperId: 6650…" — the fields sent, cut short. */
function changeSummary(changes) {
  const parts = Object.entries(changes ?? {}).map(([key, value]) => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value ?? null);
    return `${key}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
  });
  return parts.join(" · ");
}

/** Who changed what, from every service, newest first. */
export default function AdminActivity() {
  const [area, setArea] = useState("");
  const log = useAuditLog(area);

  return (
    <AdminPage
      titleMain="Recent"
      titleScript="activity"
      lead="Every change made by an admin, a helper or a Yai's family, newest first. Changes show up here within a few seconds and stay for two years."
    >
      <section className={staff.section}>
        <div className={admin.filters} role="group" aria-label="Area">
          {AREAS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={ui.chip}
              aria-pressed={area === value}
              onClick={() => setArea(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <QueryList query={log} empty="Nothing has changed here yet.">
          {(items) => (
            <div className={`${ui.card} ${staff.tableWrap}`}>
              <table className={staff.table}>
                <caption className={ui.visuallyHidden}>Recent activity</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <time dateTime={entry.at}>
                          {formatClassTime(entry.at).thailand}
                        </time>
                      </td>
                      <th scope="row">
                        {entry.actor.name ?? entry.actor.email ?? "Someone"}
                        <br />
                        <span className={admin.muted}>
                          {ROLE_NAMES[entry.actor.role] ?? entry.actor.role}
                        </span>
                      </th>
                      <td>
                        {ACTIONS[entry.action] ?? entry.action}
                        <br />
                        <code className={admin.muted}>{entry.path}</code>
                      </td>
                      <td>{changeSummary(entry.changes) || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryList>
      </section>
    </AdminPage>
  );
}
