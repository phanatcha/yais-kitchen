import { Link } from "react-router";
import { regionRecipes } from "../../lib/catalog.js";
import { formatTHB } from "../../lib/format.js";
import PhotoSlot from "../PhotoSlot.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./YaiCard.module.css";

/** Portrait colours in the order the designs use them. */
const TONES = ["palm", "pandan", "thaiTea", "turmeric"];

/**
 * Figma "Yai card": her portrait, name, region and starting price.
 * @param {{ yai: object, index: number, headingLevel?: 2 | 3 }} props
 */
export default function YaiCard({ yai, index, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  return (
    <Link to={`/yais/${yai.id}`} className={styles.card}>
      <PhotoSlot
        shape="circle"
        tone={TONES[index % TONES.length]}
        label={yai.photo?.alt || "Yai portrait"}
        className={styles.portrait}
        // The placeholder's label would read her name twice inside the link.
        aria-hidden="true"
      />
      <Heading className={styles.name}>{yai.name}</Heading>
      <p className={styles.region}>{regionRecipes(yai.region)}</p>
      {yai.startingPrice.amount > 0 && (
        <p className={styles.price}>
          Classes from {formatTHB(yai.startingPrice.amount)}
        </p>
      )}
      {yai.isSample && (
        <span className={`${ui.tag} ${styles.sample}`}>Sample</span>
      )}
    </Link>
  );
}
