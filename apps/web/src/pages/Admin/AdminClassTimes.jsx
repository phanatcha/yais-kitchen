import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import FormError from "../../components/admin/FormError.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import {
  useAdminClassTimes,
  useAdminYais,
  useAllClasses,
  useCreateClassTime,
  useUpdateClassTime,
  useUsers,
} from "../../lib/admin.js";
import { useYai } from "../../lib/catalog.js";
import { formatDayKey, formatThaiTime, thaiDateKey } from "../../lib/format.js";
import { useAvailableTimes } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

/** "Fri 20 November, 16:00–17:30 Thailand time" */
function when(startsAt, endsAt) {
  return `${formatDayKey(thaiDateKey(startsAt))}, ${formatThaiTime(startsAt)}–${formatThaiTime(endsAt)} Thailand time`;
}

const STATUS = {
  draft: ["Needs a helper", staff.turmeric],
  published: ["Open for booking", staff.pandan],
  cancelled: ["Cancelled", staff.outlined],
};

/**
 * Families add the times their Yai is free; Admin turns one into a class
 * time and assigns a helper, which opens it for booking.
 */
export default function AdminClassTimes() {
  const helpers = useUsers("helper");
  const helperName = Object.fromEntries(
    helpers.items.map((h) => [h.id, h.name]),
  );

  return (
    <AdminPage
      titleMain="Class"
      titleScript="times"
      lead="Pick a time a Yai's family offered, choose the class, and assign a helper. Guests can book it once it has a helper."
    >
      <MakeClassTime helpers={helpers.items} />
      <ClassTimes helpers={helpers.items} helperName={helperName} />
    </AdminPage>
  );
}

function MakeClassTime({ helpers }) {
  const yais = useAdminYais();
  const [yaiId, setYaiId] = useState("");

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Make a class time</h2>
      <div className={`${ui.card} ${admin.form}`}>
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
        {yaiId && <OpenTimes key={yaiId} yaiId={yaiId} helpers={helpers} />}
      </div>
    </section>
  );
}

/** The Yai's offered times that aren't a class yet, each with its own form. */
function OpenTimes({ yaiId, helpers }) {
  const times = useAvailableTimes(yaiId);
  const yai = useYai(yaiId);
  const [now] = useState(() => Date.now());

  if (times.isPending || yai.isPending) return <Loading />;
  if (times.isError || yai.isError) {
    return <ErrorNotice error={times.error ?? yai.error} />;
  }
  const open = times.data.items.filter(
    (t) => !t.isUsed && new Date(t.startsAt).getTime() > now,
  );
  if (yai.data.classes.length === 0) {
    return (
      <p className={ui.notice}>
        {yai.data.name} has no classes yet. Add one in Yais and classes.
      </p>
    );
  }
  if (open.length === 0) {
    return (
      <p className={ui.notice}>
        Her family hasn&apos;t offered any free times yet. They add them on
        their Available times page.
      </p>
    );
  }
  return (
    <ul className={staff.list}>
      {open.map((t) => (
        <OpenTime
          key={t.id}
          time={t}
          classes={yai.data.classes}
          helpers={helpers}
        />
      ))}
    </ul>
  );
}

function OpenTime({ time, classes, helpers }) {
  const create = useCreateClassTime();
  const [classId, setClassId] = useState(classes[0].id);
  const [helperId, setHelperId] = useState("");

  return (
    <li className={`${staff.row} ${admin.slot}`}>
      <div className={staff.rowInfo}>
        <h3 className={ui.h3}>{when(time.startsAt, time.endsAt)}</h3>
      </div>
      <form
        className={admin.slotForm}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            classId,
            availableTimeId: time.id,
            ...(helperId && { helperId }),
          });
        }}
      >
        <Field
          label="Class"
          as="select"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.dish} ({c.durationMinutes} min)
            </option>
          ))}
        </Field>
        <Field
          label="Helper"
          as="select"
          value={helperId}
          onChange={(e) => setHelperId(e.target.value)}
        >
          <option value="">Later</option>
          {helpers.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Field>
        <button
          type="submit"
          className={ui.primary}
          disabled={create.isPending}
        >
          {create.isPending ? "Making…" : "Make class time"}
        </button>
      </form>
      <FormError error={create.error} />
    </li>
  );
}

function ClassTimes({ helpers, helperName }) {
  const [from] = useState(() => new Date().toISOString());
  const times = useAdminClassTimes({ from });
  const yais = useAdminYais();
  const classes = useAllClasses();
  const yaiName = Object.fromEntries(yais.items.map((y) => [y.id, y.name]));
  const dish = Object.fromEntries(classes.items.map((c) => [c.id, c.dish]));

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Coming up</h2>
      <QueryList query={times} empty="No class times yet.">
        {(items) => (
          <ul className={staff.list}>
            {items.map((t) => (
              <ClassTimeRow
                key={t.id}
                time={t}
                title={`${dish[t.classId] ?? "Class"} with ${yaiName[t.yaiId] ?? "her Yai"}`}
                helpers={helpers}
                helperName={helperName}
              />
            ))}
          </ul>
        )}
      </QueryList>
    </section>
  );
}

function ClassTimeRow({ time: t, title, helpers, helperName }) {
  const update = useUpdateClassTime();
  const [confirming, setConfirming] = useState(false);
  const [label, tone] = STATUS[t.status];
  const live = t.status !== "cancelled";

  return (
    <li className={`${ui.card} ${staff.row}`}>
      <div className={staff.rowInfo}>
        <span className={`${staff.statusTag} ${tone}`}>{label}</span>
        <h3 className={ui.h3}>{title}</h3>
        <p className={ui.body}>{when(t.startsAt, t.endsAt)}</p>
        <p className={ui.small}>
          Up to {t.capacity} guests. Helper:{" "}
          {t.helperId ? (helperName[t.helperId] ?? "assigned") : "none yet"}
        </p>
      </div>
      {live && (
        <div className={staff.rowActions}>
          <Field
            label={t.helperId ? "Change helper" : "Assign a helper"}
            as="select"
            value=""
            onChange={(e) =>
              e.target.value &&
              update.mutate({ classTimeId: t.id, helperId: e.target.value })
            }
            disabled={update.isPending}
          >
            <option value="">Choose…</option>
            {helpers
              .filter((h) => h.id !== t.helperId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </Field>
          {confirming ? (
            <div className={admin.actions}>
              <p className={ui.body}>Cancel it and refund every guest?</p>
              <button
                type="button"
                className={ui.primary}
                onClick={() =>
                  update.mutate({ classTimeId: t.id, status: "cancelled" })
                }
                disabled={update.isPending}
              >
                Yes, cancel
              </button>
              <button
                type="button"
                className={ui.outline}
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={ui.outline}
              onClick={() => setConfirming(true)}
            >
              Cancel class
            </button>
          )}
        </div>
      )}
      <FormError error={update.error} />
    </li>
  );
}
