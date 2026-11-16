import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import FormError from "../../components/admin/FormError.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import {
  useAdminPayouts,
  useAdminYais,
  useCreatePayout,
  useMarkPaid,
  usePayments,
  useRefunds,
} from "../../lib/admin.js";
import { formatClassTime, formatDate, formatTHB } from "../../lib/format.js";
import { useEarnings } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

const PAYMENT_STATUS = {
  requires_payment: "Waiting",
  succeeded: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};
const METHOD = { card: "Card", promptpay: "PromptPay" };

/** Yais' earnings and payouts, then guests' payments and refunds. */
export default function AdminMoney() {
  const yais = useAdminYais();
  const [yaiId, setYaiId] = useState("");

  return (
    <AdminPage
      titleMain="Payouts and"
      titleScript="payments"
      lead="Each Yai earns 75% of what guests pay once a class has happened. Make a payout for a period, send it by PromptPay, then mark it paid here."
    >
      <section className={staff.section}>
        <h2 className={ui.h3}>Yai payouts</h2>
        <div className={admin.fields}>
          <Field
            label="Yai"
            as="select"
            value={yaiId}
            onChange={(e) => setYaiId(e.target.value)}
          >
            <option value="">Choose a Yai</option>
            {yais.items.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Field>
        </div>
        {yaiId && <YaiMoney key={yaiId} yaiId={yaiId} />}
      </section>
      <Payments />
      <Refunds />
    </AdminPage>
  );
}

function YaiMoney({ yaiId }) {
  const earnings = useEarnings(yaiId, "month");
  const payouts = useAdminPayouts(yaiId);

  let summary;
  if (earnings.isPending) summary = <Loading />;
  else if (earnings.isError) summary = <ErrorNotice error={earnings.error} />;
  else {
    summary = (
      <p className={ui.body}>
        She has earned {formatTHB(earnings.data.total.amount)} from{" "}
        {earnings.data.rows.reduce((n, r) => n + r.bookings, 0)} bookings so
        far.
      </p>
    );
  }

  return (
    <>
      {summary}
      <NewPayout yaiId={yaiId} />
      <QueryList query={payouts} empty="No payouts for her yet.">
        {(items) => (
          <ul className={staff.list}>
            {items.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </ul>
        )}
      </QueryList>
    </>
  );
}

function NewPayout({ yaiId }) {
  const create = useCreatePayout();
  const [periodStart, setStart] = useState("");
  const [periodEnd, setEnd] = useState("");
  const [status, setStatus] = useState("");

  return (
    <form
      className={`${ui.card} ${admin.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        setStatus("");
        create.mutate(
          { yaiId, periodStart, periodEnd },
          {
            onSuccess: (p) =>
              setStatus(`Made a payout of ${formatTHB(p.amount.amount)}.`),
          },
        );
      }}
    >
      <h3 className={ui.h3}>Make a payout</h3>
      <p className={ui.body}>
        Every finished class in these dates that isn&apos;t in a payout yet.
      </p>
      <div className={admin.slotForm}>
        <Field
          label="From"
          type="date"
          required
          value={periodStart}
          onChange={(e) => setStart(e.target.value)}
        />
        <Field
          label="To"
          type="date"
          required
          min={periodStart}
          value={periodEnd}
          onChange={(e) => setEnd(e.target.value)}
        />
        <button
          type="submit"
          className={ui.primary}
          disabled={create.isPending}
        >
          {create.isPending ? "Making…" : "Make payout"}
        </button>
      </div>
      <p className={ui.body} role="status">
        {status}
      </p>
      <FormError error={create.error} />
    </form>
  );
}

function PayoutRow({ payout: p }) {
  const markPaid = useMarkPaid();
  const [reference, setReference] = useState("");
  // A refund after the transfer: a due payout just shrinks, a paid one can't.
  const recovery =
    p.status === "paid" && p.refundAdjustments?.some((a) => a.recoveryRequired);

  return (
    <li className={`${ui.card} ${staff.row}`}>
      <div className={staff.rowInfo}>
        <span
          className={`${staff.statusTag} ${p.status === "paid" ? staff.pandan : staff.turmeric}`}
        >
          {p.status === "paid" ? "Paid" : "Due"}
        </span>
        <h3 className={ui.h3}>
          {formatTHB(p.amount.amount)}, {formatDate(p.periodStart)} to{" "}
          {formatDate(p.periodEnd)}
        </h3>
        {p.status === "paid" && (
          <p className={ui.small}>
            Paid {p.paidAt ? formatDate(p.paidAt) : ""}. PromptPay reference:{" "}
            {p.reference ?? "–"}
          </p>
        )}
        {recovery && (
          <p className={ui.error}>
            A guest was refunded after this was paid. Recover the difference
            from the family.
          </p>
        )}
      </div>
      {p.status === "due" && (
        <form
          className={staff.rowActions}
          onSubmit={(e) => {
            e.preventDefault();
            markPaid.mutate({ payoutId: p.id, reference: reference.trim() });
          }}
        >
          <Field
            label="PromptPay reference"
            required
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button
            type="submit"
            className={ui.primary}
            disabled={markPaid.isPending}
          >
            Mark paid
          </button>
        </form>
      )}
      <FormError error={markPaid.error} />
    </li>
  );
}

function Payments() {
  const payments = usePayments();
  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Guest payments</h2>
      <QueryList query={payments} empty="No payments yet.">
        {(items) => (
          <div className={`${ui.card} ${staff.tableWrap}`}>
            <table className={staff.table}>
              <caption className={ui.visuallyHidden}>Guest payments</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Booking</th>
                  <th scope="col">Method</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={staff.num}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{formatClassTime(p.createdAt).thailand}</th>
                    <td>{p.bookingId}</td>
                    <td>{METHOD[p.method] ?? p.method}</td>
                    <td>{PAYMENT_STATUS[p.status] ?? p.status}</td>
                    <td className={staff.num}>{formatTHB(p.amount.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryList>
    </section>
  );
}

function Refunds() {
  const refunds = useRefunds();
  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Refunds</h2>
      <QueryList query={refunds} empty="No refunds yet.">
        {(items) => (
          <div className={`${ui.card} ${staff.tableWrap}`}>
            <table className={staff.table}>
              <caption className={ui.visuallyHidden}>Refunds</caption>
              <thead>
                <tr>
                  <th scope="col">Booking</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.bookingId ?? "–"}</th>
                    <td>{r.status ?? "–"}</td>
                    <td>{r.reason ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryList>
    </section>
  );
}
