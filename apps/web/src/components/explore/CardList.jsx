import { ErrorNotice, Loading } from "../QueryStatus.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./CardList.module.css";

/**
 * A grid of cards from a catalog list, with its loading, error and empty
 * states. `columns` is the count at full width (1512px).
 */
export default function CardList({
  items,
  isPending,
  error,
  columns,
  label,
  empty,
  renderItem,
}) {
  if (isPending) return <Loading label={`Loading ${label}…`} />;
  if (error) return <ErrorNotice error={error} />;
  if (items.length === 0) return <p className={ui.notice}>{empty}</p>;
  return (
    <ul
      className={`${styles.grid} ${columns === 4 ? styles.four : styles.three}`}
      aria-label={label}
    >
      {items.map((item, i) => (
        <li key={item.id}>{renderItem(item, i)}</li>
      ))}
    </ul>
  );
}
