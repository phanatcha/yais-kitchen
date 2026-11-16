import { useState } from "react";
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
 * centred. A `photo` from the API (or a bundled `src`) fills it; the slot
 * shows again if the photo can't load.
 * @param {{ tone?: string | number, shape?: "rect" | "circle", photo?: { alt?: string, urls?: { thumb: string, card: string, hero: string } }, src?: string, alt?: string, sizes?: string }} props
 *   `tone` is a tone name, or a row index that cycles through the list tones
 *   (thai tea, palm sugar, pandan, turmeric).
 */
export default function PhotoSlot({
  label,
  tone = "pandan",
  shape = "rect",
  className = "",
  photo,
  src,
  alt,
  sizes = "(max-width: 768px) 100vw, 50vw",
  ...rest
}) {
  const [failed, setFailed] = useState(false);
  const name =
    typeof tone === "number" ? LIST_TONES[tone % LIST_TONES.length] : tone;
  const shapeClass = shape === "circle" ? styles.circle : "";
  const urls = photo?.urls;
  const showImage = !failed && (urls || src);
  return (
    <div
      className={`${styles.slot} ${shapeClass} ${tones[name]} ${className}`}
      {...rest}
    >
      {showImage ? (
        <img
          className={styles.image}
          src={urls ? urls.card : src}
          srcSet={
            urls && `${urls.thumb} 400w, ${urls.card} 800w, ${urls.hero} 1600w`
          }
          sizes={urls ? sizes : undefined}
          alt={alt ?? (photo?.alt || label)}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <img src={imageMark} alt="" width="32" height="26" />
          <span className={styles.label}>{label}</span>
        </>
      )}
    </div>
  );
}
