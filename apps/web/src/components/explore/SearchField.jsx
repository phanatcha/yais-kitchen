import { useId } from "react";
import searchMark from "../../assets/search-mark.svg";
import ui from "../../styles/ui.module.css";
import styles from "./SearchField.module.css";

/** Figma "Search bar": a round search box with the search mark. */
export default function SearchField({ label, placeholder, value, onChange }) {
  const id = useId();
  return (
    <div className={styles.field} role="search">
      <label htmlFor={id} className={ui.visuallyHidden}>
        {label}
      </label>
      <img
        className={styles.mark}
        src={searchMark}
        alt=""
        width="24"
        height="24"
      />
      <input
        id={id}
        type="search"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
