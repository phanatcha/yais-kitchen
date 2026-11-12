import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import iconCaptions from "../../assets/icon-captions.svg";
import iconCheck from "../../assets/icon-check.svg";
import iconLanguages from "../../assets/icon-languages.svg";
import iconLeave from "../../assets/icon-leave.svg";
import iconMic from "../../assets/icon-mic.svg";
import iconVideo from "../../assets/icon-video.svg";
import imageMark from "../../assets/image-mark.svg";
import liveDot from "../../assets/live-dot.svg";
import { errorText } from "../../lib/errors.js";
import { useEndClass, useLiveState, useSetStep } from "../../lib/live.js";
import ui from "../../styles/ui.module.css";
import styles from "./LiveRoom.module.css";

/** "32 min of about 90", or before the start "Starts in 12 min" / "2 h 5 min" / "7 days" */
function elapsedText(minutes, durationMinutes) {
  if (minutes >= 0) {
    return `${Math.min(minutes, durationMinutes)} min of about ${durationMinutes}`;
  }
  const left = -minutes;
  if (left >= 1440) {
    const days = Math.floor(left / 1440);
    return `Starts in ${days} day${days === 1 ? "" : "s"}`;
  }
  if (left >= 60)
    return `Starts in ${Math.floor(left / 60)} h ${left % 60} min`;
  return `Starts in ${left} min`;
}

/**
 * Figma 12 Live Class. The video is a placeholder until LiveKit is wired in;
 * the recipe steps come from the API. Helpers also get step and end controls.
 */
export default function LiveRoom({
  classTimeId,
  dish,
  yaiName,
  startsAt,
  durationMinutes,
  recipe,
  isHelper = false,
  onLeave,
  afterHref,
  joinError,
}) {
  const stateQuery = useLiveState(classTimeId, { poll: !isHelper });
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const state = stateQuery.data;
  const ended = Boolean(state?.endedAt);
  const stepIndex = state?.step.index ?? 0;
  const stepTotal = state?.step.total ?? recipe?.steps.length ?? 0;
  const minutesIn = Math.floor((now - new Date(startsAt).getTime()) / 60000);

  let tag = (
    <span className={styles.liveTag}>
      <img src={liveDot} alt="" width="10" height="10" />
      Live
    </span>
  );
  if (ended) {
    tag = <span className={`${styles.liveTag} ${styles.quietTag}`}>Ended</span>;
  } else if (minutesIn < 0) {
    tag = (
      <span className={`${styles.liveTag} ${styles.quietTag}`}>
        Not started
      </span>
    );
  }

  return (
    <div className={styles.room}>
      <header className={styles.bar}>
        {tag}
        <h1 className={styles.classTitle}>
          {dish} with {yaiName}
        </h1>
        {!ended && (
          <p className={styles.elapsed}>
            {elapsedText(minutesIn, durationMinutes)}
          </p>
        )}
        {ended && afterHref && (
          <Link className={styles.afterLink} to={afterHref}>
            The class has ended. See your recipe card
          </Link>
        )}
      </header>

      {joinError && (
        <p className={styles.banner} role="alert">
          {errorText(joinError)}
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.stage}>
          <div className={styles.video}>
            <span className={`${ui.tag} ${styles.teacherTag}`}>
              {yaiName}, teaching in Thai
            </span>
            <div className={`${styles.tile} ${styles.selfTile}`}>
              <img src={imageMark} alt="" width="32" height="26" />
              <span>{videoOff ? "Your video is off" : "Your camera"}</span>
            </div>
            <div className={`${styles.tile} ${styles.helperTile}`}>
              <img src={imageMark} alt="" width="32" height="26" />
              <span>{isHelper ? "You (helper)" : "Your helper"}</span>
            </div>
            <p className={styles.videoLabel}>
              <img src={imageMark} alt="" width="32" height="26" />
              Live video from {yaiName}&apos;s kitchen
            </p>
          </div>

          {captionsOn && (
            <section className={styles.captions} aria-label="Captions">
              <img src={iconLanguages} alt="" width="28" height="28" />
              <div className={styles.captionLines}>
                <p className={styles.captionSource}>
                  Auto-translate, translating from Thai (sample caption)
                </p>
                <p className={styles.captionThai} lang="th">
                  ผัดพริกแกงกับหัวกะทิไปเรื่อยๆ จนหอม อย่าให้ไหม้นะ
                </p>
                <p className={styles.captionEnglish}>
                  “Keep stirring the paste in the coconut cream until it smells
                  fragrant. Don’t let it burn.”
                </p>
              </div>
            </section>
          )}

          <div className={styles.controls} role="group" aria-label="Call">
            <ControlButton
              icon={iconMic}
              pressed={muted}
              onClick={() => setMuted((m) => !m)}
              label="Mute"
            />
            <ControlButton
              icon={iconVideo}
              pressed={videoOff}
              onClick={() => setVideoOff((v) => !v)}
              label="Stop video"
            />
            <ControlButton
              icon={iconCaptions}
              pressed={captionsOn}
              onClick={() => setCaptionsOn((c) => !c)}
              label="Captions"
              quiet
            />
            <ControlButton
              icon={iconLeave}
              onClick={onLeave}
              label="Leave"
              danger
            />
          </div>
        </div>

        <aside className={styles.panel} aria-label="Recipe">
          <div className={styles.panelHeading}>
            <h2 className={ui.h3}>Yai&apos;s {dish.toLowerCase()}</h2>
            {stepTotal > 0 && (
              <p className={ui.body} aria-live="polite">
                Step {stepIndex + 1} of {stepTotal}
              </p>
            )}
          </div>

          {stateQuery.isError ? (
            <p className={ui.notice}>{errorText(stateQuery.error)}</p>
          ) : (
            <ol className={styles.steps}>
              {Array.from({ length: stepTotal }, (_, i) => (
                <Step
                  key={i}
                  number={i + 1}
                  state={
                    i < stepIndex ? "done" : i === stepIndex ? "now" : "next"
                  }
                  text={
                    recipe?.steps[i]?.text ?? "Your Yai will show this step."
                  }
                />
              ))}
            </ol>
          )}

          {isHelper ? (
            <HelperControls
              classTimeId={classTimeId}
              stepIndex={stepIndex}
              stepTotal={stepTotal}
              ended={ended}
            />
          ) : (
            <AskYai />
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * A round call button with a constant name; aria-pressed carries the state.
 * `quiet` skips the pressed colour (captions are on by default, and the
 * captions box itself shows the state).
 */
function ControlButton({
  icon,
  label,
  onClick,
  pressed,
  danger = false,
  quiet = false,
}) {
  return (
    <button
      type="button"
      className={quiet ? `${styles.control} ${styles.quiet}` : styles.control}
      onClick={onClick}
      aria-pressed={pressed}
    >
      <span
        className={
          danger
            ? `${styles.controlCircle} ${styles.danger}`
            : styles.controlCircle
        }
      >
        <img src={icon} alt="" width="26" height="26" />
      </span>
      {label}
    </button>
  );
}

function Step({ number, state, text }) {
  if (state === "now") {
    return (
      <li className={styles.stepNow} aria-current="step">
        <span className={styles.stepNowHeader}>
          <span className={styles.stepNowDot}>{number}</span>
          Cook this now
        </span>
        <span className={styles.stepNowText}>{text}</span>
      </li>
    );
  }
  return (
    <li className={styles.step}>
      <span
        className={
          state === "done" ? `${styles.dot} ${styles.dotDone}` : styles.dot
        }
      >
        {state === "done" ? (
          <img src={iconCheck} alt="Done:" width="18" height="18" />
        ) : (
          number
        )}
      </span>
      <span>{text}</span>
    </li>
  );
}

/** "Ask Yai a question". Not sent anywhere yet: questions go through the call. */
function AskYai() {
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setStatus(`Sent to your helper: “${question.trim()}”`);
    setQuestion("");
  }

  return (
    <form className={`${ui.field} ${styles.ask}`} onSubmit={handleSubmit}>
      <label htmlFor={inputId} className={ui.label}>
        Ask Yai a question
      </label>
      <input
        id={inputId}
        className={ui.input}
        placeholder="Type here, or just say it out loud"
        maxLength={300}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <p className={ui.small} role="status">
        {status}
      </p>
    </form>
  );
}

/** FR-33: the helper moves the recipe for everyone and ends the class. */
function HelperControls({ classTimeId, stepIndex, stepTotal, ended }) {
  const setStep = useSetStep(classTimeId);
  const endClass = useEndClass(classTimeId);
  const error = setStep.error ?? endClass.error;

  function handleEnd() {
    if (window.confirm("End the class for everyone?")) endClass.mutate();
  }

  return (
    <div className={styles.helperControls}>
      <div className={styles.stepButtons}>
        <button
          type="button"
          className={ui.outline}
          onClick={() => setStep.mutate(stepIndex - 1)}
          disabled={stepIndex <= 0 || ended}
        >
          Back a step
        </button>
        <button
          type="button"
          className={ui.primary}
          onClick={() => setStep.mutate(stepIndex + 1)}
          disabled={stepIndex >= stepTotal - 1 || ended}
        >
          Next step
        </button>
      </div>
      <button
        type="button"
        className={`${ui.button} ${styles.endButton}`}
        onClick={handleEnd}
        disabled={ended || endClass.isPending}
      >
        {ended ? "Class ended" : "End class"}
      </button>
      {error && (
        <p className={ui.error} role="alert">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}
