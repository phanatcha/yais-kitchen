import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import BookingLayout from "../../components/booking/BookingLayout.jsx";
import BookingSummary from "../../components/booking/BookingSummary.jsx";
import MissingCheckout from "../../components/booking/MissingCheckout.jsx";
import { hasAccessToken } from "../../lib/api.js";
import {
  useCreateBooking,
  useReleaseHold,
  useStartGuestSession,
} from "../../lib/booking.js";
import { readCheckout, saveCheckout } from "../../lib/checkout.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./YourDetails.module.css";

const LANGUAGES = [
  "English",
  "Chinese (中文)",
  "Japanese (日本語)",
  "Korean (한국어)",
  "French (Français)",
  "German (Deutsch)",
  "Spanish (Español)",
];

const EXPERIENCE = ["A little", "New to cooking", "I cook a lot"];

export default function YourDetails() {
  const navigate = useNavigate();
  const [checkout] = useState(readCheckout);
  const saved = checkout.details ?? {};

  const startGuest = useStartGuestSession();
  const createBooking = useCreateBooking();
  const releaseHold = useReleaseHold();

  const [name, setName] = useState(saved.name ?? "");
  const [email, setEmail] = useState(saved.email ?? "");
  const [language, setLanguage] = useState(saved.language ?? LANGUAGES[0]);
  const [allergies, setAllergies] = useState(saved.allergies ?? "");
  const [experience, setExperience] = useState(
    saved.experience ?? EXPERIENCE[0],
  );
  const [error, setError] = useState(null);

  const formId = useId();
  const nameId = useId();
  const emailId = useId();
  const languageId = useId();
  const allergiesId = useId();
  const errorId = useId();

  if (!checkout.hold || !checkout.classInfo) {
    return <MissingCheckout classId={checkout.classInfo?.id} />;
  }

  const isPending = startGuest.isPending || createBooking.isPending;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const details = {
      name: name.trim(),
      email: email.trim(),
      language,
      allergies: allergies.trim(),
      experience,
    };
    try {
      // A signed-in tourist already has a token. Everyone else checks out as a guest.
      if (!hasAccessToken()) {
        await startGuest.mutateAsync({
          email: details.email,
          name: details.name,
        });
      }
      const booking = await createBooking.mutateAsync({
        holdId: checkout.hold.id,
      });
      // Language, allergies and experience have no API field yet, so they
      // stay in this tab for the helper brief.
      saveCheckout({ details, booking });
      navigate("/book/payment");
    } catch (err) {
      setError(err);
    }
  }

  function handleBack() {
    releaseHold.mutate(checkout.hold.id);
    navigate(`/classes/${checkout.classInfo.id}/book`);
  }

  const needsSignIn = error?.code === "sign_in_needed";

  return (
    <BookingLayout
      step={2}
      titleMain="Your"
      titleScript="details"
      lead="This helps your Yai and helper get ready for you."
      side={
        <>
          <BookingSummary
            classInfo={checkout.classInfo}
            startsAt={checkout.startsAt}
            guests={checkout.hold.guests}
            total={checkout.hold.total}
          />
          {error && (
            <p id={errorId} className={ui.error} role="alert">
              {errorText(error)}{" "}
              {needsSignIn && (
                <Link
                  className={ui.link}
                  to="/sign-in"
                  state={{ from: "/book/details" }}
                >
                  Sign in
                </Link>
              )}
            </p>
          )}
          <button
            type="submit"
            form={formId}
            className={`${ui.primary} ${ui.block}`}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Continue to payment"}
          </button>
          <button
            type="button"
            className={`${ui.outline} ${ui.block}`}
            onClick={handleBack}
          >
            Back
          </button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={handleSubmit}
        aria-describedby={error ? errorId : undefined}
      >
        <div className={ui.field}>
          <label htmlFor={nameId} className={ui.label}>
            Full name
          </label>
          <input
            id={nameId}
            className={ui.input}
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={ui.field}>
          <label htmlFor={emailId} className={ui.label}>
            Email
          </label>
          <input
            id={emailId}
            className={ui.input}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={ui.field}>
          <label htmlFor={languageId} className={ui.label}>
            Language for your helper
          </label>
          <select
            id={languageId}
            className={ui.input}
            name="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className={ui.field}>
          <label htmlFor={allergiesId} className={ui.label}>
            Food allergies or food you avoid
          </label>
          <input
            id={allergiesId}
            className={ui.input}
            name="allergies"
            maxLength={200}
            placeholder="None"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </div>

        <fieldset className={`${ui.choices} ${styles.experience}`}>
          <legend className={ui.choicesLegend}>
            How much have you cooked before?
          </legend>
          {EXPERIENCE.map((option) => (
            <label key={option} className={ui.choice}>
              <input
                type="radio"
                name="experience"
                className={ui.visuallyHidden}
                value={option}
                checked={experience === option}
                onChange={() => setExperience(option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      </form>
    </BookingLayout>
  );
}
