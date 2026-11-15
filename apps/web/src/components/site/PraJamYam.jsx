import styles from "./PraJamYam.module.css";

/** The Figma "Pra jam yam band": a row of Thai flower motifs. Decoration only. */
export default function PraJamYam({ className = "" }) {
  return <div className={`${styles.band} ${className}`} aria-hidden="true" />;
}
