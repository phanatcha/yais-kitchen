import { useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import FormError from "../../components/admin/FormError.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import { useAdminYais, useCreateUser, useUsers } from "../../lib/admin.js";
import ui from "../../styles/ui.module.css";
import staff from "../../components/StaffPage.module.css";
import admin from "../../components/admin/admin.module.css";

const ROLES = [
  ["family", "Yai's family"],
  ["helper", "Helper"],
  ["admin", "Admin"],
  ["tourist", "Guest"],
];
const ROLE_NAMES = Object.fromEntries(ROLES);

const EMPTY = { name: "", email: "", role: "family", yaiId: "" };

/**
 * Team accounts. Guests make their own when they book; Admin makes the
 * family, helper and admin ones. Everyone signs in with an emailed code.
 */
export default function AdminAccounts() {
  const [role, setRole] = useState("");
  const users = useUsers(role);
  const yais = useAdminYais();
  const yaiName = Object.fromEntries(yais.items.map((y) => [y.id, y.name]));

  return (
    <AdminPage
      titleMain="Team"
      titleScript="accounts"
      lead="Make an account for each Yai's family, each helper and each admin. They sign in with a code we email them, so there is no password to send."
    >
      <NewAccount yais={yais.items} />

      <section className={staff.section}>
        <h2 className={ui.h3}>Accounts</h2>
        <div className={admin.filters} role="group" aria-label="Role">
          {[["", "All"], ...ROLES].map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={ui.chip}
              aria-pressed={role === value}
              onClick={() => setRole(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <QueryList query={users} empty="No accounts here yet.">
          {(items) => (
            <div className={`${ui.card} ${staff.tableWrap}`}>
              <table className={staff.table}>
                <caption className={ui.visuallyHidden}>Accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Yai</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr key={u.id}>
                      <th scope="row">{u.name}</th>
                      <td>{u.email}</td>
                      <td>{ROLE_NAMES[u.role] ?? u.role}</td>
                      <td>{u.yaiId ? (yaiName[u.yaiId] ?? "–") : "–"}</td>
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

function NewAccount({ yais }) {
  const create = useCreateUser();
  const [values, setValues] = useState(EMPTY);
  const [status, setStatus] = useState("");
  const text = (key) => ({
    value: values[key],
    onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    create.mutate(
      {
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        ...(values.role === "family" && { yaiId: values.yaiId }),
      },
      {
        onSuccess: (user) => {
          setStatus(
            `Made ${user.name}'s account. They sign in with ${user.email}.`,
          );
          setValues(EMPTY);
        },
      },
    );
  }

  return (
    <section className={staff.section}>
      <h2 className={ui.h3}>Make an account</h2>
      <form className={`${ui.card} ${admin.form}`} onSubmit={handleSubmit}>
        <div className={admin.fields}>
          <Field label="Name" required maxLength={80} {...text("name")} />
          <Field
            label="Email"
            type="email"
            required
            maxLength={254}
            {...text("email")}
          />
          <Field label="Role" as="select" {...text("role")}>
            {ROLES.filter(([value]) => value !== "tourist").map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </Field>
          {values.role === "family" && (
            <Field label="Their Yai" as="select" required {...text("yaiId")}>
              <option value="" disabled>
                Choose a Yai
              </option>
              {yais.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Field>
          )}
        </div>
        <div className={admin.actions}>
          <button
            type="submit"
            className={ui.primary}
            disabled={create.isPending}
          >
            {create.isPending ? "Making…" : "Make account"}
          </button>
          <p className={ui.body} role="status">
            {status}
          </p>
        </div>
        <FormError error={create.error} />
      </form>
    </section>
  );
}
