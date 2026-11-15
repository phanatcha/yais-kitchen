import { useId, useState } from "react";
import iconCheck from "../../assets/icon-check.svg";
import { ApiError } from "../../lib/api.js";
import { REGION_OPTIONS, useApply } from "../../lib/catalog.js";
import { errorText } from "../../lib/errors.js";
import Checklist from "../Checklist.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./YaiSignUpForm.module.css";

const EMPTY = {
  yaiName: "",
  region: "",
  dishes: "",
  relation: "",
  contactName: "",
  email: "",
  phone: "",
};

// The API's messages name the schema rule, so each field gets its own.
const FIELD_ERRORS = {
  yaiName: "Please give her name.",
  region: "Please choose her part of Thailand.",
  dishes: "Please tell us at least one dish.",
  contactName: "Please give your name.",
  email: "Please check your email address.",
  phone: "Please give a phone number, for example +66 81 234 5678.",
};

const CONSENTS = [
  { id: "wants", label: "She knows about this and wants to teach" },
  {
    id: "contact",
    label: "Yai's Kitchen may keep these details to contact us about her",
  },
];

function Field({ id, label, error, children }) {
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Figma 16 "Tell us about her": POST /catalog/applications. The API also
 * needs her region and both an email and a phone, so the design's
 * "phone or email" field is two fields, and the relation goes in `message`.
 */
export default function YaiSignUpForm() {
  const base = useId();
  const apply = useApply();
  const [values, setValues] = useState(EMPTY);
  const [consents, setConsents] = useState([]);
  const [consentError, setConsentError] = useState("");

  const id = (name) => `${base}-${name}`;
  const fieldErrors = {};
  if (apply.error instanceof ApiError) {
    for (const d of apply.error.body?.error?.details ?? []) {
      fieldErrors[d.field] = FIELD_ERRORS[d.field] ?? d.message;
    }
  }

  function input(name, extra = {}) {
    const error = fieldErrors[name];
    return {
      id: id(name),
      name,
      className: ui.input,
      value: values[name],
      onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
      "aria-invalid": error ? "true" : undefined,
      "aria-describedby": error ? `${id(name)}-error` : undefined,
      ...extra,
    };
  }

  function toggleConsent(consent) {
    setConsentError("");
    setConsents((c) =>
      c.includes(consent) ? c.filter((x) => x !== consent) : [...c, consent],
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (consents.length < CONSENTS.length) {
      setConsentError("Tick both boxes to send the form.");
      return;
    }
    const relation = values.relation.trim();
    apply.mutate({
      yaiName: values.yaiName.trim(),
      region: values.region,
      dishes: values.dishes.trim(),
      contactName: values.contactName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      message: relation ? `She is my ${relation}.` : undefined,
      consent: true,
    });
  }

  if (apply.isSuccess) {
    return (
      <div className={styles.sent} role="status">
        <span className={styles.sentMark} aria-hidden="true">
          <img src={iconCheck} alt="" width="18" height="18" />
        </span>
        <div>
          <p className={styles.sentTitle}>
            We got the application for {apply.variables.yaiName}.
          </p>
          <p className={ui.body}>
            We will get in touch to arrange a visit to her kitchen. We have
            emailed you a copy.
          </p>
        </div>
      </div>
    );
  }

  let formError = "";
  if (apply.error) {
    formError =
      apply.error instanceof ApiError && apply.error.status === 429
        ? "You have sent a few forms already. Please try again in an hour."
        : apply.error instanceof ApiError && apply.error.status === 400
          ? "Please check the fields marked below."
          : errorText(apply.error);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.fields}>
        <Field id={id("yaiName")} label="Her name" error={fieldErrors.yaiName}>
          <input
            {...input("yaiName", {
              required: true,
              maxLength: 80,
              placeholder: "What the family calls her",
            })}
          />
        </Field>
        <Field
          id={id("region")}
          label="Where she lives"
          error={fieldErrors.region}
        >
          <select {...input("region", { required: true })}>
            <option value="" disabled>
              Choose her part of Thailand
            </option>
            {REGION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={id("dishes")}
          label="Dishes she is known for"
          error={fieldErrors.dishes}
        >
          <input
            {...input("dishes", {
              required: true,
              maxLength: 1000,
              placeholder: "For example khao soi, nam prik ong",
            })}
          />
        </Field>
        <Field id={id("relation")} label="How she is related to you">
          <input
            {...input("relation", {
              maxLength: 200,
              placeholder: "Grandmother, great-aunt, neighbour",
            })}
          />
        </Field>
        <Field
          id={id("contactName")}
          label="Your name"
          error={fieldErrors.contactName}
        >
          <input
            {...input("contactName", {
              required: true,
              maxLength: 80,
              autoComplete: "name",
              placeholder: "Your full name",
            })}
          />
        </Field>
        <Field id={id("email")} label="Your email" error={fieldErrors.email}>
          <input
            {...input("email", {
              type: "email",
              required: true,
              maxLength: 254,
              autoComplete: "email",
              placeholder: "So we can write to you",
            })}
          />
        </Field>
        <Field id={id("phone")} label="Your phone" error={fieldErrors.phone}>
          <input
            {...input("phone", {
              type: "tel",
              required: true,
              pattern: "\\+?[0-9 ()\\-]{8,20}",
              title: "A phone number, for example +66 81 234 5678",
              autoComplete: "tel",
              placeholder: "So we can arrange a visit",
            })}
          />
        </Field>
      </div>

      <div className={styles.consents}>
        <Checklist
          items={CONSENTS}
          checked={consents}
          onToggle={toggleConsent}
          label="Before you send"
        />
        {consentError && (
          <p className={ui.error} role="alert">
            {consentError}
          </p>
        )}
      </div>

      {formError && (
        <p className={ui.error} role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className={ui.primary} disabled={apply.isPending}>
        {apply.isPending ? "Sending…" : "Sign up your Yai"}
      </button>
    </form>
  );
}
