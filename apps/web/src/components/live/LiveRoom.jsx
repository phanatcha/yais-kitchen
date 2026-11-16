import { useEffect, useId, useRef, useState } from "react";
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
import {
  CAMERA,
  MICROPHONE,
  roleOf,
  trackOf,
  useLiveCall,
} from "../../lib/liveCall.js";
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

// Who takes the big picture: the Yai's kitchen first, then the helper.
const STAGE_ORDER = ["family", "helper", "admin", "tourist"];
const byStageOrder = (a, b) =>
  STAGE_ORDER.indexOf(roleOf(a)) - STAGE_ORDER.indexOf(roleOf(b));

/** What the call calls someone. Guests show their first name. */
function nameOf(participant, yaiName) {
  const name = participant.name;
  switch (roleOf(participant)) {
    case "family":
      return `${yaiName}'s kitchen`;
    case "helper":
      return name ? `${name}, helper` : "Your helper";
    case "admin":
      return name ? `${name}, Yai's Kitchen` : "Yai's Kitchen";
    default:
      return name || "Guest";
  }
}

const SELF_NAMES = {
  helper: "You (helper)",
  family: "You (the kitchen)",
  tourist: "You",
};

/**
 * Figma 12 Live Class. The video call runs on LiveKit (see liveCall.js): the
 * Yai's kitchen fills the big picture, you are top right, and everyone else
 * is along the bottom. The recipe steps come from the API. Helpers also get
 * step and end controls.
 * @param {{ role?: "tourist" | "helper" | "family" }} props
 */
export default function LiveRoom({
  classTimeId,
  dish,
  yaiName,
  startsAt,
  durationMinutes,
  recipe,
  role = "tourist",
  onLeave,
  afterHref,
}) {
  const isHelper = role === "helper";
  const stateQuery = useLiveState(classTimeId, { poll: !isHelper });
  const [now, setNow] = useState(() => Date.now());
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

  const call = useLiveCall(classTimeId, { enabled: !ended });
  const room = call.room;
  const remotes = room
    ? [...room.remoteParticipants.values()].sort(byStageOrder)
    : [];
  const [stage, ...others] = remotes;
  const stageVideo = stage && trackOf(stage, CAMERA);
  const selfVideo = room && trackOf(room.localParticipant, CAMERA);
  const micOn = room?.localParticipant.isMicrophoneEnabled ?? false;
  const cameraOn = room?.localParticipant.isCameraEnabled ?? false;

  let stageNote;
  if (!room) {
    stageNote =
      call.status === "failed" ? "Not connected" : "Joining the call…";
  } else if (!stage) {
    stageNote =
      role === "family"
        ? "Waiting for the helper and guests to join"
        : `Waiting for ${yaiName}'s kitchen to join`;
  } else if (!stageVideo) {
    stageNote = `${nameOf(stage, yaiName)} has the camera off`;
  }

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

      <CallNotices call={call} ended={ended} />

      <div className={styles.grid}>
        <div className={styles.stage}>
          <div className={styles.video}>
            {stageVideo && (
              <VideoView track={stageVideo} className={styles.stageMedia} />
            )}
            <span className={`${ui.tag} ${styles.teacherTag}`}>
              {stage && roleOf(stage) !== "family"
                ? nameOf(stage, yaiName)
                : `${yaiName}, teaching in Thai`}
            </span>
            <div className={`${styles.tile} ${styles.selfTile}`}>
              {selfVideo ? (
                <VideoView track={selfVideo} mirror className={styles.media} />
              ) : (
                <img src={imageMark} alt="" width="32" height="26" />
              )}
              <span className={styles.tileName}>
                {selfVideo ? (SELF_NAMES[role] ?? "You") : "Your video is off"}
              </span>
            </div>
            {others.length > 0 && (
              <ul className={styles.others} aria-label="Also in the class">
                {others.map((participant) => {
                  const video = trackOf(participant, CAMERA);
                  return (
                    <li
                      key={participant.identity}
                      className={
                        participant.isSpeaking
                          ? `${styles.tile} ${styles.otherTile} ${styles.speaking}`
                          : `${styles.tile} ${styles.otherTile}`
                      }
                    >
                      {video ? (
                        <VideoView track={video} className={styles.media} />
                      ) : (
                        <img src={imageMark} alt="" width="32" height="26" />
                      )}
                      <span className={styles.tileName}>
                        {nameOf(participant, yaiName)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {stageNote && (
              <p className={styles.videoLabel}>
                <img src={imageMark} alt="" width="32" height="26" />
                {stageNote}
              </p>
            )}
            {remotes.map((participant) => (
              <AudioView
                key={participant.identity}
                track={trackOf(participant, MICROPHONE)}
              />
            ))}
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
              pressed={Boolean(room) && !micOn}
              onClick={() => call.setMicrophone(!micOn)}
              label="Mute"
              disabled={!room}
            />
            <ControlButton
              icon={iconVideo}
              pressed={Boolean(room) && !cameraOn}
              onClick={() => call.setCamera(!cameraOn)}
              label="Stop video"
              disabled={!room}
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

          {isHelper && (
            <HelperControls
              classTimeId={classTimeId}
              stepIndex={stepIndex}
              stepTotal={stepTotal}
              ended={ended}
            />
          )}
          {role === "family" && (
            <p className={ui.body}>
              Point the camera at the stove, so everyone can see Yai cook. The
              helper moves the recipe along.
            </p>
          )}
          {role === "tourist" && <AskYai />}
        </aside>
      </div>
    </div>
  );
}

/**
 * What is wrong with the call, if anything, and how to put it right. A
 * camera the browser won't give still leaves the person watching.
 */
function CallNotices({ call, ended }) {
  return (
    <>
      {call.error && (
        <p className={styles.banner} role="alert">
          {errorText(call.error)}{" "}
          <button
            type="button"
            className={styles.bannerButton}
            onClick={call.retry}
          >
            Try again
          </button>
        </p>
      )}
      {call.status === "reconnecting" && (
        <p className={styles.banner} role="status">
          The connection dropped. Reconnecting…
        </p>
      )}
      {call.status === "disconnected" && !ended && (
        <p className={styles.banner} role="status">
          You&apos;re out of the call.{" "}
          <button
            type="button"
            className={styles.bannerButton}
            onClick={call.retry}
          >
            Join again
          </button>
        </p>
      )}
      {call.deviceError && (
        <p className={styles.banner} role="alert">
          We couldn&apos;t use your camera or microphone, so the others
          can&apos;t see or hear you. Allow them for this site in your browser,
          then turn them on below.
        </p>
      )}
      {call.room && !call.canPlayAudio && (
        <p className={styles.banner} role="status">
          Your browser paused the sound.{" "}
          <button
            type="button"
            className={styles.bannerButton}
            onClick={call.startAudio}
          >
            Turn on sound
          </button>
        </p>
      )}
    </>
  );
}

/** One camera, shown in a <video>. LiveKit attaches and detaches the track. */
function VideoView({ track, mirror = false, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!track || !element) return undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      className={mirror ? `${className} ${styles.mirror}` : className}
      autoPlay
      playsInline
      muted
    />
  );
}

/** One person's microphone. Nothing shows; it only plays. */
function AudioView({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!track || !element) return undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return <audio ref={ref} autoPlay />;
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
  disabled = false,
  danger = false,
  quiet = false,
}) {
  return (
    <button
      type="button"
      className={quiet ? `${styles.control} ${styles.quiet}` : styles.control}
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
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
