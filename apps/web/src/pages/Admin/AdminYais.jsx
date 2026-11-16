import { useState } from "react";
import { Link, useNavigate } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import YaiForm from "../../components/admin/YaiForm.jsx";
import { EMPTY_YAI, yaiBody } from "../../components/admin/values.js";
import { useAdminYais, useCreateYai } from "../../lib/admin.js";
import { regionRecipes } from "../../lib/catalog.js";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";

/** Every Yai, shown or hidden, and a form to add one. */
export default function AdminYais() {
  const navigate = useNavigate();
  const yais = useAdminYais();
  const create = useCreateYai();
  const [adding, setAdding] = useState(false);

  return (
    <AdminPage
      titleMain="Yais and"
      titleScript="classes"
      lead="Add a Yai once her trial class went well, then her classes and recipes. Nothing shows on the site until you tick Show on the site."
    >
      <section className={staff.section}>
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
              Add a Yai
            </button>
          )}
        </div>
        {adding && (
          <YaiForm
            initial={EMPTY_YAI}
            submitLabel="Add her"
            pending={create.isPending}
            error={create.error}
            onSubmit={(values) =>
              create.mutate(yaiBody(values), {
                onSuccess: (yai) => navigate(`/admin/yais/${yai.id}`),
              })
            }
          />
        )}
      </section>

      <section className={staff.section}>
        <h2 className={ui.h3}>All Yais</h2>
        <QueryList query={yais} empty="No Yais yet. Add the first one above.">
          {(items) => (
            <ul className={staff.list}>
              {items.map((y) => (
                <li key={y.id} className={`${ui.card} ${staff.row}`}>
                  <div className={staff.rowInfo}>
                    {y.isSample && (
                      <span className={`${staff.statusTag} ${staff.outlined}`}>
                        Sample
                      </span>
                    )}
                    <h3 className={ui.h3}>
                      {y.name} <span lang="th">{y.nameThai}</span>
                    </h3>
                    <p className={ui.body}>
                      {regionRecipes(y.region)}
                      {y.startingPrice.amount > 0 &&
                        `, classes from ${formatTHB(y.startingPrice.amount)}`}
                    </p>
                  </div>
                  <div className={staff.rowActions}>
                    <Link to={`/admin/yais/${y.id}`} className={ui.outline}>
                      Edit her and her classes
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
