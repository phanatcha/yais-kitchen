import { useId, useState } from "react";
import { Link, useParams } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import {
  STAGES,
  nextStage,
  useApplication,
  useUpdateApplication,
} from "../../lib/admin.js";
import { REGION_OPTIONS } from "../../lib/catalog.js";
import { errorText } from "../../lib/errors.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import admin from "../../components/admin/admin.module.css";
import { StageTag } from "./AdminApplications.jsx";

const STAGE_NAMES = Object.fromEntries(STAGES);
const REGION_NAMES = Object.fromEntries(REGION_OPTIONS);

/** One sign-up: its details, its stage and Admin's notes. The email links here. */
export default function AdminApplication() {
  const { applicationId } = useParams();
  const query = useApplication(applicationId);

  let body;
  if (query.isPending) body = <Loading />;
  else if (query.isError) body = <ErrorNotice error={query.error} />;
  else if (!query.data) {
    body = (
      <p className={ui.notice} role="alert">
        We couldn&apos;t find that sign-up.{" "}
        <Link to="/admin/applications" className={ui.link}>
          See all sign-ups
        </Link>
      </p>
    );
  } else body = <Application application={query.data} />;

  return (
    <AdminPage
      titleMain="Yai"
      titleScript="sign-up"
      lead="Check the details, then move it along after each step."
    >
      {body}
    </AdminPage>
  );
}

function Application({ application: a }) {
  const update = useUpdateApplication(a.id);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [saved, setSaved] = useState("");
  const notesId = useId();
  const next = nextStage(a.stage);
  const open = a.stage !== "approved" && a.stage !== "declined";

  function move(stage) {
    setSaved("");
    update.mutate(
      { stage },
      { onSuccess: () => setSaved(`Moved to ${STAGE_NAMES[stage]}.`) },
    );
  }

  function saveNotes(event) {
    event.preventDefault();
    setSaved("");
    update.mutate({ notes }, { onSuccess: () => setSaved("Notes saved.") });
  }

  return (
    <>
      <section className={`${ui.card} ${admin.form}`}>
        <div className={admin.actions}>
          <StageTag stage={a.stage} />
          <h2 className={ui.h3}>{a.yaiName}</h2>
        </div>
        <dl className={admin.facts}>
          <dt>Region</dt>
          <dd>{REGION_NAMES[a.region] ?? a.region}</dd>
          <dt>Dishes</dt>
          <dd>{a.dishes}</dd>
          {a.message && (
            <>
              <dt>Message</dt>
              <dd>{a.message}</dd>
            </>
          )}
          <dt>Family contact</dt>
          <dd>{a.contactName}</dd>
          <dt>Email</dt>
          <dd>
            <a className={ui.link} href={`mailto:${a.email}`}>
              {a.email}
            </a>
          </dd>
          <dt>Phone</dt>
          <dd>
            <a className={ui.link} href={`tel:${a.phone.replace(/\s/g, "")}`}>
              {a.phone}
            </a>
          </dd>
          <dt>Sent</dt>
          <dd>{formatClassTime(a.createdAt).thailand}</dd>
        </dl>
        {open && (
          <div className={admin.actions}>
            {next && (
              <button
                type="button"
                className={ui.primary}
                onClick={() => move(next)}
                disabled={update.isPending}
              >
                Move to {STAGE_NAMES[next]}
              </button>
            )}
            <button
              type="button"
              className={ui.outline}
              onClick={() => move("declined")}
              disabled={update.isPending}
            >
              Decline
            </button>
          </div>
        )}
        {a.stage === "approved" && (
          <p className={ui.body}>
            Approved. Next, add her in{" "}
            <Link to="/admin/yais" className={ui.link}>
              Yais and classes
            </Link>{" "}
            and make a family account in{" "}
            <Link to="/admin/accounts" className={ui.link}>
              Accounts
            </Link>
            .
          </p>
        )}
      </section>

      <form className={`${ui.card} ${admin.form}`} onSubmit={saveNotes}>
        <div className={ui.field}>
          <label htmlFor={notesId} className={ui.label}>
            Notes
          </label>
          <textarea
            id={notesId}
            className={ui.input}
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What you saw at the kitchen visit, the trial class and so on"
          />
        </div>
        <div className={admin.actions}>
          <button
            type="submit"
            className={ui.outline}
            disabled={update.isPending}
          >
            Save notes
          </button>
          {update.error && (
            <p className={ui.error} role="alert">
              {errorText(update.error)}
            </p>
          )}
          <p className={ui.body} role="status">
            {saved}
          </p>
        </div>
      </form>

      <p>
        <Link to="/admin/applications" className={ui.link}>
          Back to all sign-ups
        </Link>
      </p>
    </>
  );
}
