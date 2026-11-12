import ui from "../styles/ui.module.css";

/** Figma page heading: a Kanit word in capitals, then a coral script word. */
export default function PageTitle({ main, script, id, className = "" }) {
  return (
    <h1 id={id} className={`${ui.title} ${className}`}>
      <span className={ui.titleMain}>{main}</span>{" "}
      <span className={ui.titleScript}>{script}</span>
    </h1>
  );
}
