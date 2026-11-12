import PageTitle from "./PageTitle.jsx";
import ui from "../styles/ui.module.css";
import styles from "./StaffPage.module.css";

/**
 * Frame for the Helper and Yai's family pages, which have no Figma frame:
 * the same tag, heading and lead as My Classes.
 */
export default function StaffPage({
  tag,
  titleMain,
  titleScript,
  lead,
  nav,
  children,
}) {
  return (
    <div className={ui.page}>
      <div className={ui.inner}>
        <p className={`${ui.tag} ${styles.tag}`}>{tag}</p>
        <PageTitle main={titleMain} script={titleScript} />
        {lead && <p className={`${ui.bodyLarge} ${styles.lead}`}>{lead}</p>}
        {nav}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
