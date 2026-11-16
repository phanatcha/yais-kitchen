import { ApiError } from "../../lib/api.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";

/** A failed save: the API's message, and which fields it named. */
export default function FormError({ error }) {
  if (!error) return null;
  const details =
    error instanceof ApiError ? (error.body?.error?.details ?? []) : [];
  return (
    <div role="alert">
      <p className={ui.error}>{errorText(error)}</p>
      {details.length > 0 && (
        <ul className={ui.error}>
          {details.map((d) => (
            <li key={`${d.field}${d.message}`}>
              {d.field}: {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
