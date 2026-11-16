import { useState } from "react";
import { Link } from "react-router";
import imageMark from "../../assets/image-mark.svg";
import { formatTHB } from "../../lib/format.js";
import ui from "../../styles/ui.module.css";
import styles from "./ClassCard.module.css";

/** Photo colours in the order the designs use them. */
const TONES = [styles.thaiTea, styles.pandan, styles.palm, styles.turmeric];

/**
 * Figma "Class card": the dish photo with a curved tab for the dish, the Yai
 * and the price.
 * @param {{ classInfo: object, index: number, headingLevel?: 2 | 3 }} props
 */
export default function ClassCard({ classInfo: c, index, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const [failed, setFailed] = useState(false);
  const urls = !failed && c.photo?.urls;
  return (
    <Link
      to={`/classes/${c.id}`}
      className={`${styles.card} ${TONES[index % TONES.length]}`}
    >
      {urls ? (
        <img
          className={styles.image}
          src={urls.card}
          srcSet={`${urls.thumb} 400w, ${urls.card} 800w`}
          sizes="(max-width: 768px) 100vw, 400px"
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.photo} aria-hidden="true">
          <img src={imageMark} alt="" width="32" height="26" />
          {c.photo?.alt || `${c.dish} photo`}
        </span>
      )}
      {c.isSample && (
        <span className={`${ui.tag} ${styles.sample}`}>Sample</span>
      )}
      <div className={styles.tab}>
        <Heading className={styles.dish}>{c.dish}</Heading>
        <span className={styles.yai}>With {c.yaiName}</span>
        <span className={styles.price}>{formatTHB(c.price.amount)}</span>
      </div>
    </Link>
  );
}
