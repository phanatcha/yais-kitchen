import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import NotFound from "./NotFound.jsx";
import PageTitle from "./PageTitle.jsx";
import ui from "../styles/ui.module.css";
import styles from "./RouteError.module.css";

/**
 * Shown in place of a page that failed to load or crashed, inside the site
 * frame so the nav still works. A page that failed to download after a new
 * release is fixed by reloading.
 */
export default function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.box}`} role="alert">
        <title>Something went wrong · Yai&apos;s Kitchen</title>
        <PageTitle main="Something went" script="wrong" />
        <p className={ui.bodyLarge}>
          This page didn&apos;t load properly. Reloading usually fixes it. If it
          keeps happening, please try again later.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={ui.primary}
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
          <Link to="/" className={ui.outline}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
