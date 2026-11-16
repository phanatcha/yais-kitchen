import { useState } from "react";
import { REGION_OPTIONS } from "../../lib/catalog.js";
import ui from "../../styles/ui.module.css";
import admin from "./admin.module.css";
import { Check, Field } from "./fields.jsx";
import FormError from "./FormError.jsx";
import { PHOTO_HINT } from "./photos.js";

/** Add or edit a Yai: names, region, story, photo and where she shows. */
export default function YaiForm({
  initial,
  submitLabel,
  onSubmit,
  pending,
  error,
  status,
}) {
  const [values, setValues] = useState(initial);
  const set = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));
  const text = (key) => ({
    value: values[key],
    onChange: (e) => set(key)(e.target.value),
  });

  return (
    <form
      className={`${ui.card} ${admin.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className={admin.fields}>
        <Field label="Name" required maxLength={80} {...text("name")} />
        <Field
          label="Name in Thai"
          required
          maxLength={80}
          lang="th"
          {...text("nameThai")}
        />
        <Field label="Region" as="select" required {...text("region")}>
          <option value="" disabled>
            Choose her region
          </option>
          {REGION_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>
        <Field
          label="Photo description"
          maxLength={200}
          placeholder="Yai stirring a pot of curry"
          {...text("photoAlt")}
        />
        <Field
          label="Her story"
          as="textarea"
          rows={5}
          wide
          required
          maxLength={4000}
          {...text("story")}
        />
        <Field
          label="Photo asset ID"
          required
          pattern="[a-f0-9]{24}"
          hint={PHOTO_HINT}
          wide
          {...text("photoAssetId")}
        />
      </div>
      <div className={admin.checks}>
        <Check
          label="Show on the site"
          checked={values.isVisible}
          onChange={set("isVisible")}
        />
        <Check
          label="Feature on Home"
          checked={values.isFeatured}
          onChange={set("isFeatured")}
        />
        <Check
          label="Sample (made up for the prototype)"
          checked={values.isSample}
          onChange={set("isSample")}
        />
      </div>
      <div className={admin.actions}>
        <button type="submit" className={ui.primary} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <p className={ui.body} role="status">
          {status}
        </p>
      </div>
      <FormError error={error} />
    </form>
  );
}
