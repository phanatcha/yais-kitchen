import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import BookingLayout from "../../components/booking/BookingLayout.jsx";
import BookingSummary from "../../components/booking/BookingSummary.jsx";
import Checklist from "../../components/Checklist.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import clockIcon from "../../assets/icon-clock.svg";
import {
  useBooking,
  useRecipe,
  useUpdateChecklist,
} from "../../lib/booking.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./GetReady.module.css";

const KITCHEN = [
  { id: "pot", label: "A pot for the curry" },
  { id: "pan", label: "A frying pan or wok" },
  { id: "stove", label: "A stove or hot plate" },
  { id: "knife", label: "A knife and chopping board" },
  { id: "bowl", label: "A bowl to serve in" },
];

const DEVICE = [
  { id: "charged", label: "Charged or plugged in" },
  { id: "propped", label: "Propped up facing your stove" },
  { id: "tested", label: "Camera and sound tested" },
];

/** "2 days, 14 hours", "3 hours, 5 minutes", "12 minutes" */
function timeUntil(ms) {
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const part = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0) return `${part(days, "day")}, ${part(hours, "hour")}`;
  if (hours > 0) return `${part(hours, "hour")}, ${part(mins, "minute")}`;
  return part(Math.max(mins, 1), "minute");
}

// Kitchen and device ticks have no API field, so they stay in this browser.
const storageKey = (bookingId) => `yk_ready_${bookingId}`;

function readLocalTicks(bookingId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(bookingId))) ?? [];
  } catch {
    return [];
  }
}

function writeLocalTicks(bookingId, ids) {
  try {
    localStorage.setItem(storageKey(bookingId), JSON.stringify(ids));
  } catch {
    // Storage blocked: the ticks last until the page closes.
  }
}

export default function GetReady() {
  const { bookingId } = useParams();
  const bookingQuery = useBooking(bookingId);
  const recipeQuery = useRecipe(bookingQuery.data?.class.id);
  const updateChecklist = useUpdateChecklist(bookingId);

  const [now, setNow] = useState(() => Date.now());
  const [localTicks, setLocalTicks] = useState(() => readLocalTicks(bookingId));
  const [deviceStatus, setDeviceStatus] = useState("");

  // Refresh the countdown once a minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (bookingQuery.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Loading your class…" />
      </div>
    );
  }
  if (bookingQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={bookingQuery.error} />
      </div>
    );
  }

  const booking = bookingQuery.data;
  const startsIn = new Date(booking.startsAt).getTime() - now;
  const endsIn = new Date(booking.endsAt).getTime() - now;
  let countdown = `Your class starts in ${timeUntil(startsIn)}`;
  if (startsIn <= 0) countdown = "Your class has started";
  if (endsIn <= 0 && startsIn < 0) countdown = "Your class has finished";

  function toggleLocal(id) {
    const next = localTicks.includes(id)
      ? localTicks.filter((t) => t !== id)
      : [...localTicks, id];
    setLocalTicks(next);
    writeLocalTicks(bookingId, next);
  }

  function toggleIngredient(id) {
    const current = booking.checkedIngredientIds;
    updateChecklist.mutate(
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
    );
  }

  async function testDevices() {
    setDeviceStatus("Asking your browser for the camera and microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());
      setDeviceStatus("Your camera and microphone work.");
      if (!localTicks.includes("tested")) toggleLocal("tested");
    } catch {
      setDeviceStatus(
        "We couldn't reach your camera or microphone. Check that your browser allows them for this site.",
      );
    }
  }

  const dish = booking.class.dish.toLowerCase();

  return (
    <BookingLayout
      top={
        <p className={styles.countdown}>
          <img src={clockIcon} alt="" width="24" height="24" />
          {countdown}
        </p>
      }
      titleMain="Get"
      titleScript="ready"
      lead={`Shop and set up before your ${dish} class with ${booking.class.yaiName}. Tick things off as you go.`}
      side={
        <>
          <BookingSummary
            classInfo={booking.class}
            startsAt={booking.startsAt}
            guests={booking.guests}
            total={booking.total}
          />
          <Link
            className={`${ui.primary} ${ui.block}`}
            to={`/my-classes/${bookingId}/live`}
          >
            Join the live class
          </Link>
          <Link className={`${ui.outline} ${ui.block}`} to="/my-classes">
            See my classes
          </Link>
          <p className={`${ui.small} ${styles.joinNote}`}>
            The class opens 10 minutes before it starts.
            <br />
            In this prototype you can join now.
          </p>
        </>
      }
    >
      <div className={styles.columns}>
        <section className={styles.buy} aria-labelledby="buy-heading">
          <ShoppingList
            query={recipeQuery}
            checked={booking.checkedIngredientIds}
            onToggle={toggleIngredient}
            saveError={updateChecklist.error}
          />
        </section>

        <div className={styles.setup}>
          <section className={styles.group}>
            <h2 className={ui.h3}>In your kitchen</h2>
            <Checklist
              label="In your kitchen"
              items={KITCHEN}
              checked={localTicks}
              onToggle={toggleLocal}
            />
          </section>
          <section className={styles.group}>
            <h2 className={ui.h3}>Your phone or laptop</h2>
            <Checklist
              label="Your phone or laptop"
              items={DEVICE}
              checked={localTicks}
              onToggle={toggleLocal}
            />
            <button
              type="button"
              className={`${ui.outline} ${styles.testButton}`}
              onClick={testDevices}
            >
              Test camera and sound
            </button>
            <p className={ui.small} role="status">
              {deviceStatus}
            </p>
          </section>
        </div>
      </div>
    </BookingLayout>
  );
}

function ShoppingList({ query, checked, onToggle, saveError }) {
  if (query.isPending) return <Loading label="Loading the shopping list…" />;
  if (query.isError) {
    return (
      <>
        <h2 id="buy-heading" className={ui.h3}>
          What to buy
        </h2>
        <p className={ui.notice}>
          {query.error?.status === 404
            ? "Your Yai is still writing the shopping list. Check back soon."
            : errorText(query.error)}
        </p>
      </>
    );
  }

  const recipe = query.data;
  const items = recipe.ingredients.map((i) => ({
    id: i.id,
    label: i.name,
    amount: i.quantity,
  }));
  const done = items.filter((i) => checked.includes(i.id)).length;

  return (
    <>
      <div className={styles.headingRow}>
        <h2 id="buy-heading" className={ui.h3}>
          What to buy
        </h2>
        <p className={ui.body} aria-live="polite">
          {done} of {items.length} ticked
        </p>
      </div>
      <Checklist
        label="What to buy"
        items={items}
        checked={checked}
        onToggle={onToggle}
      />
      {saveError && (
        <p className={ui.error} role="alert">
          We couldn&apos;t save that tick. {errorText(saveError)}
        </p>
      )}
      {recipe.yaiTip && (
        <p className={ui.body}>
          <strong className={styles.tipLabel}>Yai&apos;s tip:</strong>{" "}
          {recipe.yaiTip}
        </p>
      )}
    </>
  );
}
