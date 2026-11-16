import { useState } from "react";
import { Link, useParams } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import ClassForm from "../../components/admin/ClassForm.jsx";
import RecipeEditor from "../../components/admin/RecipeEditor.jsx";
import { classBody, classToValues } from "../../components/admin/values.js";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useUpdateClass } from "../../lib/admin.js";
import { useClass } from "../../lib/booking.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";

/** One class: its details, then the recipe guests shop and cook from. */
export default function AdminClass() {
  const { classId } = useParams();
  const query = useClass(classId);
  const c = query.data;

  let body;
  if (query.isPending) body = <Loading />;
  else if (query.isError) body = <ErrorNotice error={query.error} />;
  else {
    body = (
      <>
        <ClassDetails key={c.id} classInfo={c} />
        <section className={staff.section}>
          <h2 className={ui.h3}>Recipe</h2>
          <p className={ui.body}>
            Guests get the shopping list after they book, and the steps run
            beside the video in the live class.
          </p>
          <RecipeEditor classId={c.id} />
        </section>
      </>
    );
  }

  return (
    <AdminPage
      titleMain={c?.dish ?? "Class"}
      titleScript="class"
      lead={c ? `With ${c.yaiName}.` : undefined}
    >
      {body}
      {c && (
        <p>
          <Link to={`/admin/yais/${c.yaiId}`} className={ui.link}>
            Back to {c.yaiName}
          </Link>
        </p>
      )}
    </AdminPage>
  );
}

function ClassDetails({ classInfo }) {
  const update = useUpdateClass(classInfo.id);
  const [status, setStatus] = useState("");
  const before = classToValues(classInfo);

  function save(values) {
    setStatus("");
    const patch = classBody(values, before);
    if (Object.keys(patch).length === 0) {
      setStatus("Nothing changed.");
      return;
    }
    update.mutate(patch, { onSuccess: () => setStatus("Saved.") });
  }

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>The class</h2>
      <ClassForm
        initial={before}
        submitLabel="Save"
        pending={update.isPending}
        error={update.error}
        status={status}
        onSubmit={save}
      />
    </section>
  );
}
