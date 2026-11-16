import { Fragment, useState } from "react";
import AdminPage from "../../components/admin/AdminPage.jsx";
import { Field } from "../../components/admin/fields.jsx";
import FormError from "../../components/admin/FormError.jsx";
import QueryList from "../../components/admin/QueryList.jsx";
import {
  useAdminYais,
  useCreateUser,
  useUpdateUser,
  useUsers,
} from "../../lib/admin.js";
import { useMe } from "../../lib/auth.js";
import { errorText } from "../../lib/errors.js";
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
  const [editing, setEditing] = useState(null);
  const users = useUsers(role);
  const yais = useAdminYais();
  const me = useMe();
  const yaiName = Object.fromEntries(yais.items.map((y) => [y.id, y.name]));

  return (
    <AdminPage
      titleMain="Team"
      titleScript="accounts"
      lead="Make an account for each Yai's family, each helper and each admin. They sign in with a code we email them, so there is no password to send. Change someone's role, or turn an account off so it can't sign in."
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
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className={ui.visuallyHidden}>Change</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <Fragment key={u.id}>
                      <tr>
                        <th scope="row">{u.name}</th>
                        <td>{u.email}</td>
                        <td>{ROLE_NAMES[u.role] ?? u.role}</td>
                        <td>{u.yaiId ? (yaiName[u.yaiId] ?? "–") : "–"}</td>
                        <td>
                          {u.disabledAt ? (
                            <span
                              className={`${staff.statusTag} ${staff.outlined}`}
                            >
                              Turned off
                            </span>
                          ) : (
                            "On"
                          )}
                        </td>
                        <td>
                          {me.data?.id === u.id ? (
                            <span className={admin.muted}>You</span>
                          ) : (
                            <button
                              type="button"
                              className={ui.link}
                              aria-expanded={editing === u.id}
                              onClick={() =>
                                setEditing(editing === u.id ? null : u.id)
                              }
                            >
                              {editing === u.id ? "Close" : "Change"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {editing === u.id && (
                        <tr>
                          <td colSpan={6}>
                            <ChangeAccount user={u} yais={yais.items} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

/**
 * Role, Yai, and turning the account off or on. Saving a new role or
 * turning it off signs the person out, so they sign in again.
 */
function ChangeAccount({ user, yais }) {
  const update = useUpdateUser();
  const [role, setRole] = useState(user.role);
  const [yaiId, setYaiId] = useState(user.yaiId ?? "");
  const [confirmOff, setConfirmOff] = useState(false);
  const [status, setStatus] = useState("");
  const roleChanged =
    role !== user.role || (role === "family" && yaiId !== (user.yaiId ?? ""));

  function saveRole(event) {
    event.preventDefault();
    setStatus("");
    update.mutate(
      { id: user.id, role, ...(role === "family" && { yaiId }) },
      {
        onSuccess: (saved) =>
          setStatus(
            `${saved.name} is now ${ROLE_NAMES[saved.role]}. They'll sign in again to use it.`,
          ),
      },
    );
  }

  function turn(disabled) {
    setStatus("");
    setConfirmOff(false);
    update.mutate(
      { id: user.id, disabled },
      {
        onSuccess: (saved) =>
          setStatus(
            disabled
              ? `${saved.name}'s account is off. They're signed out and can't sign in.`
              : `${saved.name}'s account is on again.`,
          ),
      },
    );
  }

  return (
    <div className={admin.stack}>
      <form className={admin.slotForm} onSubmit={saveRole}>
        <Field
          label="Role"
          as="select"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {ROLES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>
        {role === "family" ? (
          <Field
            label="Their Yai"
            as="select"
            required
            value={yaiId}
            onChange={(e) => setYaiId(e.target.value)}
          >
            <option value="" disabled>
              Choose a Yai
            </option>
            {yais.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Field>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className={ui.primary}
          disabled={!roleChanged || update.isPending}
        >
          Save role
        </button>
      </form>
      <div className={admin.actions}>
        {user.disabledAt ? (
          <button
            type="button"
            className={ui.outline}
            onClick={() => turn(false)}
            disabled={update.isPending}
          >
            Turn account on
          </button>
        ) : confirmOff ? (
          <>
            <p className={ui.body}>
              Turn off {user.name}&apos;s account? They&apos;re signed out
              straight away and can&apos;t sign in until you turn it back on.
            </p>
            <button
              type="button"
              className={ui.primary}
              onClick={() => turn(true)}
              disabled={update.isPending}
            >
              Turn it off
            </button>
            <button
              type="button"
              className={ui.outline}
              onClick={() => setConfirmOff(false)}
            >
              Keep it on
            </button>
          </>
        ) : (
          <button
            type="button"
            className={ui.outline}
            onClick={() => setConfirmOff(true)}
          >
            Turn account off
          </button>
        )}
        <p className={ui.body} role="status">
          {status}
        </p>
      </div>
      {update.error && (
        <p className={ui.error} role="alert">
          {errorText(update.error)}
        </p>
      )}
    </div>
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
