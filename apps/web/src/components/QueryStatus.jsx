import { Link, useLocation } from "react-router";
import { ApiError } from "../lib/api.js";
import ui from "../styles/ui.module.css";

/** Shown while a page's data loads. */
export function Loading({ label = "Loading…" }) {
  return (
    <p className={ui.notice} role="status">
      {label}
    </p>
  );
}

/**
 * Explains a failed request. A 401 links to Sign In and comes back here
 * afterwards, because the access token lives only in memory.
 */
export function ErrorNotice({ error }) {
  const location = useLocation();
  if (!error) return null;

  if (error instanceof ApiError && error.status === 401) {
    return (
      <p className={ui.notice} role="alert">
        Please sign in to see this page.{" "}
        <Link
          className={ui.link}
          to="/sign-in"
          state={{ from: location.pathname }}
        >
          Sign in
        </Link>
      </p>
    );
  }

  let message = error.message;
  if (!(error instanceof ApiError)) {
    message =
      "We couldn't reach the server. Check your connection and try again.";
  } else if (error.status === 403) {
    message = "Your account can't open this page.";
  } else if (error.status === 404) {
    message = "We couldn't find that.";
  }

  return (
    <p className={ui.notice} role="alert">
      {message}
    </p>
  );
}
