import imageMark from "../assets/image-mark.svg";
import styles from "./PhotoSlot.module.css";

const tones = {
  pandan: styles.pandan,
  thaiTea: styles.thaiTea,
  turmeric: styles.turmeric,
  rice: styles.rice,
};

/**
 * The Figma "Photo slot": a coloured box with an image mark and a label.
 * Real photos replace it once media is served.
 */
export default function PhotoSlot({ label, tone = "pandan", className = "" }) {
  return (
    <div className={`${styles.slot} ${tones[tone]} ${className}`}>
      <img src={imageMark} alt="" width="32" height="26" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
