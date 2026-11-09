import { logContext, MAX_ATTEMPTS } from "@yais-kitchen/shared";
import * as emails from "./emails.js";

const RETRY_AFTER_MS = 60_000;

/**
 * Sends the reminders 24 hours and 1 hour before class. Every instance
 * checks MongoDB on a timer, and each reminder is claimed by one instance
 * only, so running two never sends one twice.
 */
export function createReminders({
  store,
  sendOnce,
  links,
  logger,
  now = () => new Date(),
  batchSize = 50,
}) {
  async function sendOne(reminder) {
    const booking = await store.findBooking(reminder.bookingId);
    if (booking?.status !== "confirmed") {
      await store.finishReminder(reminder._id, "cancelled");
      return;
    }
    if (now() >= reminder.lastChanceAt) {
      logger.warn(
        { kind: reminder.kind },
        "too late for this reminder; skipping it",
      );
      await store.finishReminder(reminder._id, "skipped");
      return;
    }

    try {
      await sendOnce(`reminder:${reminder._id}`, {
        to: booking.email,
        userId: booking.userId,
        template: `reminder_${reminder.kind}`,
        content: emails.reminder({
          ...booking,
          kind: reminder.kind,
          link: links.getReady(booking._id),
        }),
      });
      await store.finishReminder(reminder._id, "sent");
    } catch (error) {
      const { attempts } = reminder;
      if (attempts >= MAX_ATTEMPTS) {
        logger.error({ err: error, attempts }, "gave up on this reminder");
        await store.finishReminder(reminder._id, "failed");
        return;
      }
      logger.warn(
        { err: error, attempts },
        "reminder failed; trying again later",
      );
      await store.retryReminderLater(reminder._id, RETRY_AFTER_MS * attempts);
    }
  }

  /** Sends the reminders that are due now. Returns how many it handled. */
  async function sendDue() {
    let handled = 0;
    while (handled < batchSize) {
      const reminder = await store.claimDueReminder();
      if (!reminder) break;
      handled += 1;
      await logContext.run({ reminderId: reminder._id }, () =>
        sendOne(reminder),
      );
    }
    return handled;
  }

  let timer = null;
  let running = null;
  let stopped = true;

  /** Checks for due reminders now, then every `intervalMs`. */
  function start(intervalMs) {
    stopped = false;
    const tick = async () => {
      running = sendDue().catch((error) =>
        logger.error({ err: error }, "could not check reminders"),
      );
      await running;
      running = null;
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, 0);
  }

  /** Stops the timer and waits for a check that is under way. */
  async function stop() {
    stopped = true;
    clearTimeout(timer);
    await running;
  }

  return { sendDue, start, stop };
}
