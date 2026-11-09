import { MAX_ATTEMPTS } from "@yais-kitchen/shared";
import * as emails from "./emails.js";
import { createReminders } from "./reminders.js";

/**
 * The event handlers and the reminder sender, wired to their store, mailer
 * and catalog. server.js passes the real ones, tests pass fakes.
 */
export function createNotification({
  store,
  mailer,
  catalog,
  links,
  adminEmail,
  logger,
  now = () => new Date(),
}) {
  /**
   * Sends one email unless it already went out. Each email has its own key,
   * so if an event fails halfway, the retry sends only what is missing. The
   * email is claimed first, so two copies of one event arriving together
   * can't both send it: the second one is tried again later and skipped.
   */
  async function sendOnce(key, { to, userId, template, content }) {
    const claim = await store.claimEmail(key, { template, userId });
    if (claim === "sent") {
      logger.info({ template }, "this email already went out; skipping it");
      return;
    }
    if (claim === "busy") {
      throw new Error("Another copy of this event is sending this email now.");
    }
    try {
      await mailer.send({ to, ...content });
    } catch (error) {
      await store
        .releaseEmail(key)
        .catch((releaseError) =>
          logger.warn({ err: releaseError }, "could not let go of the email"),
        );
      throw error;
    }
    await store.markSent(key);
    logger.info({ template }, "email sent");
  }

  /**
   * The Thai dish name and shopping list come from catalog. The list is also
   * on the Get Ready page, so on the last try the email goes out without it
   * rather than not at all.
   */
  async function classTimeDetails(classTimeId, attempt) {
    try {
      const details = await catalog.getClassTime(classTimeId);
      if (!details) {
        logger.warn(
          "catalog doesn't know this class time; emailing without the shopping list",
        );
      }
      return details ?? undefined;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) throw error;
      logger.warn(
        { err: error },
        "catalog can't be reached; emailing without the shopping list",
      );
      return undefined;
    }
  }

  // One handler per event notification receives in asyncapi.yaml.
  const handlers = {
    async "auth.code_requested"({ id, data }) {
      if (now() >= new Date(data.expiresAt)) {
        logger.warn(
          "the sign-in code expired before it could be sent; skipping it",
        );
        return;
      }
      await sendOnce(`${id}:sign_in_code`, {
        to: data.email,
        template: "sign_in_code",
        content: emails.signInCode(data),
      });
    },

    async "application.received"({ id, data }) {
      await sendOnce(`${id}:application_received`, {
        to: data.email,
        template: "application_received",
        content: emails.applicationReceived(data),
      });
      await sendOnce(`${id}:application_for_admin`, {
        to: adminEmail,
        template: "application_for_admin",
        content: emails.applicationForAdmin({
          ...data,
          link: links.adminApplication(data.applicationId),
        }),
      });
    },

    async "booking.confirmed"({ id, data }, { attempt }) {
      const details = await classTimeDetails(data.classTimeId, attempt);
      const booking = await store.saveConfirmedBooking(data, details);
      if (booking.status === "cancelled") {
        logger.info(
          "the booking was cancelled before it was confirmed here; not emailing",
        );
        return;
      }
      const reminders = await store.planReminders(booking);
      await sendOnce(`${id}:booking_confirmed`, {
        to: booking.email,
        userId: booking.userId,
        template: "booking_confirmed",
        content: emails.bookingConfirmed({
          ...booking,
          reminders,
          link: links.getReady(booking._id),
        }),
      });
    },

    async "booking.cancelled"({ id, data }) {
      const booking = await store.cancelBooking(data);
      await sendOnce(`${id}:booking_cancelled`, {
        to: data.email,
        userId: data.userId,
        template: "booking_cancelled",
        content: emails.bookingCancelled({ ...booking, ...data }),
      });
    },

    async "payment.refunded"({ id, data }) {
      const booking = await store.findBooking(data.bookingId);
      // booking.cancelled always comes first, but it may still be on its way.
      if (!booking) throw new Error("No booking is known for this refund yet.");
      await sendOnce(`${id}:payment_refunded`, {
        to: booking.email,
        userId: booking.userId,
        template: "payment_refunded",
        content: emails.paymentRefunded({ ...booking, amount: data.amount }),
      });
    },

    async "live_class.ended"({ id, data }) {
      for (const booking of await store.confirmedBookingsFor(
        data.classTimeId,
      )) {
        await sendOnce(`${id}:after_class:${booking._id}`, {
          to: booking.email,
          userId: booking.userId,
          template: "after_class",
          content: emails.afterClass({
            ...booking,
            link: links.afterClass(booking._id),
          }),
        });
      }
    },

    async "recording.ready"({ id, data }) {
      for (const booking of await store.confirmedBookingsFor(
        data.classTimeId,
      )) {
        await sendOnce(`${id}:recording_ready:${booking._id}`, {
          to: booking.email,
          userId: booking.userId,
          template: "recording_ready",
          content: emails.recordingReady({
            ...booking,
            deleteAfter: data.deleteAfter,
            link: links.afterClass(booking._id),
          }),
        });
      }
    },

    async "user.deleted"({ data }) {
      await store.forgetUser(data.userId);
      logger.info("forgot everything kept about this person");
    },
  };

  // Each event is handled once: its ID is saved when it's done, and a repeat
  // is skipped.
  const once = (handle) => async (event, info) => {
    if (await store.wasHandled(event.id)) {
      logger.info("this event was already handled; skipping it");
      return;
    }
    await handle(event, info);
    await store.markHandled(event);
  };

  return {
    handlers: Object.fromEntries(
      Object.entries(handlers).map(([type, handle]) => [type, once(handle)]),
    ),
    reminders: createReminders({ store, sendOnce, links, logger, now }),
  };
}
