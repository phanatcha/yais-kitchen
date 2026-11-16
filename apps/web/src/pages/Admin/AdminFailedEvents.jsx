import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import {
  useDiscardFailedEvent,
  useFailedEvents,
  useRetryFailedEvent,
} from "../../lib/admin.js";
import { errorText } from "../../lib/errors.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

// The queue names services read from, in words.
const SERVICES = {
  auth: "Accounts",
  catalog: "Catalog",
  booking: "Booking",
  payment: "Payment",
  notification: "Emails",
  "live-class": "Live classes",
};

/**
 * Events a service gave up on after 5 tries. Fix what went wrong (the error
 * says), then send each one back, or throw it away if it no longer matters.
 */
export default function AdminFailedEvents() {
  const query = useFailedEvents();

  let body;
  if (query.isPending) body = <Loading />;
  else if (query.isError) body = <ErrorNotice error={query.error} />;
  else if (query.data.items.length === 0) {
    body = (
      <p className={ui.notice}>
        No failed events. Everything has gone through.
      </p>
    );
  } else {
    const { items, total } = query.data;
    body = (
      <>
        <p className={ui.body}>
          {total === 1 ? "1 event is" : `${total} events are`} waiting
          {total > items.length && `; here are the oldest ${items.length}`}.
        </p>
        <ul className={staff.list}>
          {items.map((item) => (
            <FailedEvent key={item.id} item={item} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <AdminPage
      titleMain="Failed"
      titleScript="events"
      lead="Messages between our services that failed 5 times, oldest first. Fix what the error says, then send each one again. Services skip anything they already did, so sending again is safe."
    >
      <div className={admin.actions}>
        <button
          type="button"
          className={ui.outline}
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? "Checking…" : "Check again"}
        </button>
      </div>
      {body}
    </AdminPage>
  );
}

function FailedEvent({ item }) {
  const retry = useRetryFailedEvent();
  const discard = useDiscardFailedEvent();
  const [confirming, setConfirming] = useState(false);
  const busy = retry.isPending || discard.isPending;
  const error = retry.error ?? discard.error;

  return (
    <li className={`${ui.card} ${staff.row}`}>
      <div className={staff.rowInfo}>
        <span className={`${staff.statusTag} ${staff.turmeric}`}>
          {SERVICES[item.queue] ?? item.queue ?? "Unknown service"}
        </span>
        <h2 className={ui.h3}>{item.type ?? "Not a valid event"}</h2>
        <p className={ui.body}>{item.error}</p>
        <dl className={admin.facts}>
          {item.failedAt && (
            <>
              <dt>Failed</dt>
              <dd>{formatClassTime(item.failedAt).thailand}</dd>
            </>
          )}
          {item.attempts && (
            <>
              <dt>Tries</dt>
              <dd>{item.attempts}</dd>
            </>
          )}
          {item.eventId && (
            <>
              <dt>Event</dt>
              <dd>
                <code>{item.eventId}</code>
              </dd>
            </>
          )}
          {item.data && (
            <>
              <dt>Data</dt>
              <dd>
                <code>{JSON.stringify(item.data)}</code>
              </dd>
            </>
          )}
        </dl>
        {error && (
          <p className={ui.error} role="alert">
            {errorText(error)}
          </p>
        )}
      </div>
      <div className={staff.rowActions}>
        {confirming ? (
          <>
            <button
              type="button"
              className={ui.primary}
              onClick={() => discard.mutate(item.id)}
              disabled={busy}
            >
              Throw away for good
            </button>
            <button
              type="button"
              className={ui.outline}
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep it
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={ui.primary}
              onClick={() => retry.mutate(item.id)}
              disabled={busy || !item.queue}
            >
              {retry.isPending ? "Sending…" : "Send again"}
            </button>
            <button
              type="button"
              className={ui.outline}
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              Throw away
            </button>
          </>
        )}
      </div>
    </li>
  );
}
