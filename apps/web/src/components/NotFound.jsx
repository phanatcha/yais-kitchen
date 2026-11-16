import { Link } from "react-router";
import PageTitle from "./PageTitle.jsx";
import ui from "../styles/ui.module.css";
import styles from "./RouteError.module.css";

/** A path with no page. */
export default function NotFound() {
  return (
    <div className={ui.page}>
      <div className={`${ui.inner} ${styles.box}`}>
        <title>Page not found · Yai&apos;s Kitchen</title>
        <PageTitle main="Page not" script="found" />
        <p className={ui.bodyLarge}>
          We couldn&apos;t find that page. It may have moved.
        </p>
        <div className={styles.actions}>
          <Link to="/" className={ui.primary}>
            Back to home
          </Link>
          <Link to="/classes" className={ui.outline}>
            See the classes
          </Link>
        </div>
      </div>
    </div>
  );
}
