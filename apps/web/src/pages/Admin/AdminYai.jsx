import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import ClassForm from "../../components/admin/ClassForm.jsx";
import YaiForm from "../../components/admin/YaiForm.jsx";
import {
  EMPTY_CLASS,
  classBody,
  yaiBody,
  yaiToValues,
} from "../../components/admin/values.js";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useCreateClass, useUpdateYai } from "../../lib/admin.js";
import { useYai } from "../../lib/catalog.js";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";

/** One Yai: edit her, see her classes and add one. */
export default function AdminYai() {
  const { yaiId } = useParams();
  const query = useYai(yaiId);

  let body;
  if (query.isPending) body = <Loading />;
  else if (query.isError) body = <ErrorNotice error={query.error} />;
  else body = <Yai key={query.data.id} yai={query.data} />;

  return (
    <AdminPage
      titleMain={query.data?.name ?? "Yai"}
      titleScript="details"
      lead="What guests see about her, and the classes she teaches."
    >
      {body}
      <p>
        <Link to="/admin/yais" className={ui.link}>
          Back to all Yais
        </Link>
      </p>
    </AdminPage>
  );
}

function Yai({ yai }) {
  const navigate = useNavigate();
  const update = useUpdateYai(yai.id);
  const createClass = useCreateClass();
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const before = yaiToValues(yai);

  function save(values) {
    setStatus("");
    const patch = yaiBody(values, before, yai);
    if (Object.keys(patch).length === 0) {
      setStatus("Nothing changed.");
      return;
    }
    update.mutate(patch, { onSuccess: () => setStatus("Saved.") });
  }

  return (
    <>
      <section className={staff.section}>
        <h2 className={ui.h3}>About her</h2>
        <YaiForm
          initial={before}
          submitLabel="Save"
          pending={update.isPending}
          error={update.error}
          status={status}
          onSubmit={save}
        />
        {yai.isVisible && (
          <p className={ui.body}>
            <Link to={`/yais/${yai.id}`} className={ui.link}>
              See her page on the site
            </Link>
          </p>
        )}
      </section>

      <section className={staff.section}>
        <h2 className={ui.h3}>Her classes</h2>
        {yai.classes.length === 0 ? (
          <p className={ui.notice}>No classes yet. Add one below.</p>
        ) : (
          <ul className={staff.list}>
            {yai.classes.map((c) => (
              <li key={c.id} className={`${ui.card} ${staff.row}`}>
                <div className={staff.rowInfo}>
                  <h3 className={ui.h3}>
                    {c.dish} <span lang="th">{c.dishThai}</span>
                  </h3>
                  <p className={ui.body}>
                    {formatTHB(c.price.amount)} per person, about{" "}
                    {c.durationMinutes} minutes
                  </p>
                </div>
                <div className={staff.rowActions}>
                  <Link to={`/admin/classes/${c.id}`} className={ui.outline}>
                    Edit class and recipe
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div>
          {adding ? (
            <button
              type="button"
              className={ui.outline}
              onClick={() => setAdding(false)}
            >
              Close the form
            </button>
          ) : (
            <button
              type="button"
              className={ui.primary}
              onClick={() => setAdding(true)}
            >
              Add a class
            </button>
          )}
        </div>
        {adding && (
          <ClassForm
            initial={EMPTY_CLASS}
            submitLabel="Add the class"
            pending={createClass.isPending}
            error={createClass.error}
            onSubmit={(values) =>
              createClass.mutate(
                { yaiId: yai.id, ...classBody(values) },
                { onSuccess: (c) => navigate(`/admin/classes/${c.id}`) },
              )
            }
          />
        )}
      </section>
    </>
  );
}
