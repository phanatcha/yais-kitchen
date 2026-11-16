import { useState } from "react";
import ui from "../../styles/ui.module.css";
import admin from "./admin.module.css";
import { Check, Field } from "./fields.jsx";
import FormError from "./FormError.jsx";
import { PHOTO_HINT } from "./photos.js";

/** Add or edit a class: the dish, price, length, guests and photo. */
export default function ClassForm({
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
        <Field label="Dish" required maxLength={80} {...text("dish")} />
        <Field
          label="Dish in Thai"
          required
          maxLength={80}
          lang="th"
          {...text("dishThai")}
        />
        <Field
          label="What guests will cook"
          as="textarea"
          rows={3}
          wide
          required
          maxLength={4000}
          {...text("description")}
        />
        <Field
          label="Price per person (THB)"
          type="number"
          required
          min={1}
          step={1}
          {...text("priceBaht")}
        />
        <Field
          label="Length (minutes)"
          type="number"
          required
          min={30}
          max={240}
          step={5}
          {...text("durationMinutes")}
        />
        <Field
          label="Most guests"
          type="number"
          required
          min={1}
          max={6}
          {...text("maxGuests")}
        />
        <Field
          label="Photo description"
          maxLength={200}
          placeholder="Khao soi in a bowl"
          {...text("photoAlt")}
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
