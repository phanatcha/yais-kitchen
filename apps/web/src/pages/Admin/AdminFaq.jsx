import { useState } from "react";
import { Link } from "react-router";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import FormError from "../../components/admin/FormError.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useSaveFaq } from "../../lib/admin.js";
import { FAQ_GROUPS, useFaq } from "../../lib/catalog.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

const newKey = () => crypto.randomUUID();

/** The Help and FAQ page's answers. Saving replaces every group at once. */
export default function AdminFaq() {
  const faq = useFaq();

  let body;
  if (faq.isPending) body = <Loading />;
  else if (faq.isError) body = <ErrorNotice error={faq.error} />;
  else body = <FaqForm faq={faq.data} />;

  return (
    <AdminPage
      titleMain="Help"
      titleScript="answers"
      lead="The questions on the Help and FAQ page, in five groups. A group with no questions doesn't show."
    >
      {body}
    </AdminPage>
  );
}

function FaqForm({ faq }) {
  const save = useSaveFaq();
  const [status, setStatus] = useState("");
  const [groups, setGroups] = useState(() =>
    Object.fromEntries(
      FAQ_GROUPS.map(([id]) => [
        id,
        (faq.groups.find((g) => g.id === id)?.items ?? []).map((item) => ({
          ...item,
          key: newKey(),
        })),
      ]),
    ),
  );

  const setItems = (id, update) =>
    setGroups((all) => ({ ...all, [id]: update(all[id]) }));
  const edit = (id, key, field) => (e) =>
    setItems(id, (items) =>
      items.map((item) =>
        item.key === key ? { ...item, [field]: e.target.value } : item,
      ),
    );

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    const body = {
      groups: FAQ_GROUPS.map(([id]) => ({
        id,
        items: groups[id].map((item) => ({
          question: item.question.trim(),
          answer: item.answer.trim(),
        })),
      })).filter((g) => g.items.length > 0),
    };
    save.mutate(body, { onSuccess: () => setStatus("Answers saved.") });
  }

  return (
    <form className={staff.section} onSubmit={handleSubmit}>
      {FAQ_GROUPS.map(([id, title]) => (
        <section key={id} className={`${ui.card} ${admin.form}`}>
          <h2 className={ui.h3}>{title}</h2>
          {groups[id].length === 0 && (
            <p className={ui.body}>No questions in this group.</p>
          )}
          {groups[id].map((item, n) => (
            <div key={item.key} className={admin.faqItem}>
              <Field
                label={`Question ${n + 1}`}
                required
                maxLength={300}
                value={item.question}
                onChange={edit(id, item.key, "question")}
              />
              <Field
                label="Answer"
                as="textarea"
                rows={3}
                required
                maxLength={3000}
                value={item.answer}
                onChange={edit(id, item.key, "answer")}
              />
              <div>
                <button
                  type="button"
                  className={ui.outline}
                  onClick={() =>
                    setItems(id, (items) =>
                      items.filter((x) => x.key !== item.key),
                    )
                  }
                >
                  Remove question {n + 1}
                </button>
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              className={ui.outline}
              onClick={() =>
                setItems(id, (items) => [
                  ...items,
                  { question: "", answer: "", key: newKey() },
                ])
              }
              disabled={groups[id].length >= 30}
            >
              Add a question
            </button>
          </div>
        </section>
      ))}
      <div className={admin.actions}>
        <button type="submit" className={ui.primary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save all answers"}
        </button>
        <p className={ui.body} role="status">
          {status}
        </p>
        <Link to="/help" className={ui.link}>
          See the Help page
        </Link>
      </div>
      <FormError error={save.error} />
    </form>
  );
}
