import { useId } from "react";
import ui from "../../styles/ui.module.css";
import admin from "./admin.module.css";

/** A labelled input, select or textarea for the Admin forms. */
export function Field({ label, hint, as = "input", wide, children, ...props }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const Control = as;
  return (
    <div className={`${ui.field} ${wide ? admin.wide : ""}`}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <Control
        id={id}
        className={ui.input}
        aria-describedby={hint ? hintId : undefined}
        {...props}
      >
        {children}
      </Control>
      {hint && (
        <p id={hintId} className={ui.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A labelled checkbox. */
export function Check({ label, checked, onChange }) {
  return (
    <label className={admin.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
