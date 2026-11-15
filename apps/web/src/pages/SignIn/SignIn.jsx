import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../../lib/api.js";
import { useRequestCode, useSignIn } from "../../lib/auth.js";
import iconCheck from "../../assets/icon-check.svg";
import imageMark from "../../assets/image-mark.svg";
import sparkle from "../../assets/sparkle.svg";
import styles from "./SignIn.module.css";

const CODE_LENGTH = 6;
/** Seconds before "Send a new code" unlocks after a code is sent. */
const RESEND_SECONDS = 60;

/** 42 → "0:42" */
function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** Turns a failed request into a sentence safe to show the user. */
function errorMessage(error) {
  if (!error) return "";
  if (!(error instanceof ApiError)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (error.code === "code_expired" || error.code === "code_locked") {
    return `${error.message} Send yourself a new code below.`;
  }
  return error.message;
}

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestCode = useRequestCode();
  const signIn = useSignIn();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [cameBack, setCameBack] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Counts down one second at a time while a resend is locked.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const titleId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();

  const trimmedEmail = email.trim();

  function handleEmailSubmit(event) {
    event.preventDefault();
    requestCode.mutate(trimmedEmail, {
      onSuccess: () => {
        signIn.reset();
        setCode("");
        setNotice("");
        setResendIn(RESEND_SECONDS);
        setStep("code");
      },
    });
  }

  function handleCodeSubmit(event) {
    event.preventDefault();
    signIn.mutate(
      { email: trimmedEmail, code },
      {
        onSuccess: () => {
          navigate(location.state?.from ?? "/my-classes", { replace: true });
        },
      },
    );
  }

  function handleResend() {
    signIn.reset();
    setNotice("");
    requestCode.mutate(trimmedEmail, {
      onSuccess: () => {
        setCode("");
        setResendIn(RESEND_SECONDS);
        setNotice(`We sent a new code to ${trimmedEmail}.`);
      },
    });
  }

  function handleChangeEmail() {
    requestCode.reset();
    signIn.reset();
    setCode("");
    setNotice("");
    setCameBack(true);
    setResendIn(0);
    setStep("email");
  }

  const emailError = step === "email" ? errorMessage(requestCode.error) : "";
  const codeError =
    step === "code" ? errorMessage(signIn.error ?? requestCode.error) : "";

  // The box that shows the caret: the next empty one, or the last when full.
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <section className={styles.page} aria-labelledby={titleId}>
      <div className={styles.inner}>
        <p className={styles.tag}>Prototype: no real account or email</p>

        <div className={styles.columns}>
          <div className={styles.main}>
            <h1 id={titleId} className={styles.title}>
              <span className={styles.titleMain}>Sign</span>{" "}
              <span className={styles.titleScript}>in</span>
            </h1>
            <p className={styles.intro}>
              We email you a 6-digit code. No password to remember.
            </p>

            {step === "email" ? (
              <form className={styles.form} onSubmit={handleEmailSubmit}>
                <div className={styles.field}>
                  <label htmlFor={emailId} className={styles.label}>
                    Email
                  </label>
                  <input
                    id={emailId}
                    className={styles.input}
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    autoFocus={cameBack}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? emailErrorId : undefined}
                  />
                  {emailError && (
                    <p id={emailErrorId} className={styles.error} role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className={styles.primary}
                  disabled={requestCode.isPending}
                >
                  {requestCode.isPending ? "Sending code…" : "Email me a code"}
                </button>
              </form>
            ) : (
              <form className={styles.form} onSubmit={handleCodeSubmit}>
                <div className={styles.field}>
                  <label htmlFor={emailId} className={styles.label}>
                    Email
                  </label>
                  <input
                    id={emailId}
                    className={styles.input}
                    type="email"
                    name="email"
                    readOnly
                    value={trimmedEmail}
                  />
                </div>

                <div className={styles.codeSent}>
                  <span className={styles.checkDot} aria-hidden="true">
                    <img src={iconCheck} alt="" width="14" height="14" />
                  </span>
                  <p id={codeHintId} className={styles.codeSentText}>
                    Code sent to {trimmedEmail}.
                  </p>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={handleChangeEmail}
                  >
                    Change email
                  </button>
                </div>

                <div className={styles.field}>
                  <label htmlFor={codeId} className={styles.label}>
                    Enter the 6-digit code
                  </label>
                  <div className={styles.codeBoxes}>
                    <input
                      id={codeId}
                      className={styles.codeInput}
                      type="text"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={CODE_LENGTH}
                      maxLength={CODE_LENGTH}
                      required
                      autoFocus
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value
                            .replace(/\D/g, "")
                            .slice(0, CODE_LENGTH),
                        )
                      }
                      aria-invalid={codeError ? true : undefined}
                      aria-describedby={
                        codeError ? `${codeHintId} ${codeErrorId}` : codeHintId
                      }
                    />
                    <div className={styles.digits} aria-hidden="true">
                      {Array.from({ length: CODE_LENGTH }, (_, i) => (
                        <span
                          key={i}
                          className={
                            i === activeIndex
                              ? `${styles.digit} ${styles.digitActive}`
                              : styles.digit
                          }
                        >
                          {code[i] ??
                            (i === activeIndex && (
                              <span className={styles.caret} />
                            ))}
                        </span>
                      ))}
                    </div>
                  </div>
                  {codeError && (
                    <p id={codeErrorId} className={styles.error} role="alert">
                      {codeError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className={styles.primary}
                  disabled={signIn.isPending}
                >
                  {signIn.isPending ? "Signing in…" : "Sign in"}
                </button>

                <p className={styles.resend}>
                  Didn&apos;t get it?{" "}
                  {resendIn > 0 ? (
                    // Not a live region: reading it out every second is noise.
                    <>
                      You can ask for a new code in{" "}
                      <time dateTime={`PT${resendIn}S`}>
                        {formatCountdown(resendIn)}
                      </time>
                      .
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.resendButton}
                      onClick={handleResend}
                      disabled={requestCode.isPending}
                    >
                      {requestCode.isPending ? "Sending…" : "Send a new code"}
                    </button>
                  )}
                </p>
              </form>
            )}

            <p className={styles.notice} role="status">
              {notice}
            </p>

            <div className={styles.newHere}>
              <p className={styles.newHereText}>
                New here? Your account is made when you book your first class.
              </p>
              <Link to="/" className={styles.outline}>
                Find your Yai
              </Link>
            </div>
          </div>

          <figure className={styles.aside}>
            <img
              className={styles.sparkle}
              src={sparkle}
              alt=""
              width="72"
              height="72"
            />
            <div className={styles.photo}>
              <img src={imageMark} alt="" width="32" height="26" />
              <span className={styles.photoLabel}>
                Photo: Yai&apos;s hands pounding chili paste
              </span>
            </div>
            <figcaption className={styles.caption}>
              Your classes, shopping lists and recipe cards, all in one place.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
