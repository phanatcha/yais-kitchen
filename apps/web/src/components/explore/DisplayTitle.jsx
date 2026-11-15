import styles from "./DisplayTitle.module.css";

/**
 * The big Explore heading: Kanit capitals, then a coral script word with the
 * zigzag underline, e.g. "MEET THE Yais".
 * @param {{ zigzag: { src: string, width: number, height: number } }} props
 */
export default function DisplayTitle({ main, script, zigzag, className = "" }) {
  return (
    <h1 className={`${styles.title} ${className}`}>
      <span className={styles.main}>{main}</span>{" "}
      <span className={styles.script}>
        {script}
        <img
          className={styles.zigzag}
          src={zigzag.src}
          alt=""
          width={zigzag.width}
          height={zigzag.height}
        />
      </span>
    </h1>
  );
}
