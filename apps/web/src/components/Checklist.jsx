import iconCheck from "../assets/icon-check.svg";
import ui from "../styles/ui.module.css";
import styles from "./Checklist.module.css";

/**
 * Figma "Checklist item": a round box that turns pandan with a tick.
 * Each row is a real checkbox with its label.
 * @param {{ items: { id: string, label: string, amount?: string }[], checked: string[], onToggle: (id: string) => void, label: string }} props
 */
export default function Checklist({ items, checked, onToggle, label }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => {
        const isChecked = checked.includes(item.id);
        return (
          <li key={item.id}>
            <label className={styles.item}>
              <input
                type="checkbox"
                className={ui.visuallyHidden}
                checked={isChecked}
                onChange={() => onToggle(item.id)}
              />
              <span className={styles.box} aria-hidden="true">
                {isChecked && (
                  <img src={iconCheck} alt="" width="16" height="16" />
                )}
              </span>
              <span className={styles.name}>{item.label}</span>
              {item.amount && (
                <span className={styles.amount}>{item.amount}</span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
