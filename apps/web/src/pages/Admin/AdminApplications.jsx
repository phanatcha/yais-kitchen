import { Link, useSearchParams } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import { STAGES, useApplications } from "../../lib/admin.js";
import { regionRecipes } from "../../lib/catalog.js";
import { formatClassTime } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

const STAGE_NAMES = Object.fromEntries(STAGES);

/** Stage tag colours: turmeric while it needs work, pandan once approved. */
export function StageTag({ stage }) {
  const tone =
    stage === "approved"
      ? staff.pandan
      : stage === "declined"
        ? staff.outlined
        : staff.turmeric;
  return (
    <span className={`${staff.statusTag} ${tone}`}>{STAGE_NAMES[stage]}</span>
  );
}

/** Become a Yai sign-ups, filtered by stage. */
export default function AdminApplications() {
  const [params, setParams] = useSearchParams();
  const stage = params.get("stage") ?? "";
  const query = useApplications(stage);

  return (
    <AdminPage
      titleMain="Yai"
      titleScript="sign-ups"
      lead="Families who want their Yai to teach. Move each one through the kitchen visit and trial class, or decline it."
    >
      <section className={staff.section}>
        <div className={admin.filters} role="group" aria-label="Stage">
          {[["", "All"], ...STAGES].map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={ui.chip}
              aria-pressed={stage === value}
              onClick={() => setParams(value ? { stage: value } : {})}
            >
              {label}
            </button>
          ))}
        </div>
        <QueryList query={query} empty="No sign-ups here yet.">
          {(items) => (
            <ul className={staff.list}>
              {items.map((a) => (
                <li key={a.id} className={`${ui.card} ${staff.row}`}>
                  <div className={staff.rowInfo}>
                    <StageTag stage={a.stage} />
                    <h2 className={ui.h3}>{a.yaiName}</h2>
                    <p className={ui.body}>
                      {regionRecipes(a.region)}. Known for: {a.dishes}
                    </p>
                    <p className={ui.small}>
                      From {a.contactName},{" "}
                      {formatClassTime(a.createdAt).thailand}
                    </p>
                  </div>
                  <div className={staff.rowActions}>
                    <Link
                      to={`/admin/applications/${a.id}`}
                      className={ui.outline}
                    >
                      Open
                    </Link>
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
