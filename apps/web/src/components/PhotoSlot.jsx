import imageMark from "../assets/image-mark.svg";
import styles from "./PhotoSlot.module.css";

const tones = {
  pandan: styles.pandan,
  thaiTea: styles.thaiTea,
  turmeric: styles.turmeric,
  rice: styles.rice,
  palm: styles.palm,
};

/** Tones in the order the designs use them for lists of classes. */
const LIST_TONES = ["thaiTea", "palm", "pandan", "turmeric"];

/**
 * The Figma "Photo slot": a coloured box with an image mark and a label.
 * `shape="circle"` is the Figma "Photo circle", with the mark and label
 * centred. Real photos replace it once media is served.
 * @param {{ tone?: string | number, shape?: "rect" | "circle" }} props A tone
 *   name, or a row index that cycles through the list tones (thai tea, palm
 *   sugar, pandan, turmeric).
 */
export default function PhotoSlot({
  label,
  tone = "pandan",
  shape = "rect",
  className = "",
  ...rest
}) {
  const name =
    typeof tone === "number" ? LIST_TONES[tone % LIST_TONES.length] : tone;
  const shapeClass = shape === "circle" ? styles.circle : "";
  return (
    <div
      className={`${styles.slot} ${shapeClass} ${tones[name]} ${className}`}
      {...rest}
    >
      <img src={imageMark} alt="" width="32" height="26" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
