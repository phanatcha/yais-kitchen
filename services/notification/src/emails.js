import {
  formatClassTime,
  formatDate,
  formatMoney,
  formatTime,
  ingredientLine,
  withThai,
} from "./format.js";

// Every email is plain text in plain English. Dish and ingredient names also
// appear in Thai script, so a tourist can show them at a market.

const SIGN_OFF = "Yai's Kitchen";

/** Paragraphs are separated by a blank line. Empty ones are left out. */
function message(subject, paragraphs) {
  return {
    subject: subject.replace(/\s+/g, " ").trim(),
    text: `${[...paragraphs.filter(Boolean), SIGN_OFF].join("\n\n")}\n`,
  };
}

const lines = (...parts) => parts.filter(Boolean).join("\n");

function shoppingList(ingredients) {
  if (!ingredients?.length) {
    return "Your shopping list is on the Get Ready page.";
  }
  return lines(
    "Your shopping list",
    "Buy these before class, so you can cook along at home:",
    ...ingredients.map(ingredientLine),
  );
}

function reminderPromise(reminders = []) {
  if (reminders.includes("24h") && reminders.includes("1h")) {
    return "We'll remind you a day before class and again an hour before.";
  }
  if (reminders.includes("1h")) return "We'll remind you an hour before class.";
  return null;
}

/** "Khao Soi with Yai Somsri on Friday 20 November 2026" */
function whichClass({ dish, yaiName, startsAt }) {
  const date = formatDate(startsAt);
  return dish ? `${dish} with ${yaiName} on ${date}` : `the class on ${date}`;
}

export function signInCode({ code, expiresAt }) {
  return message("Your Yai's Kitchen sign-in code", [
    "Your sign-in code is:",
    code,
    `It works until ${formatTime(expiresAt)} Thailand time. Don't share it with anyone.`,
    "If you didn't ask for a code, you can ignore this email. Nobody can sign in without it.",
  ]);
}

export function applicationReceived({ contactName, yaiName }) {
  return message(`We got the application for ${yaiName}`, [
    `Hi ${contactName},`,
    `Thank you for applying for ${yaiName} to teach with Yai's Kitchen. Your application has reached us.`,
    lines(
      "What happens next:",
      `1. We get in touch to arrange a visit to ${yaiName}'s kitchen.`,
      `2. ${yaiName} teaches a short trial class with our team.`,
      `3. We tell you whether ${yaiName} can start teaching.`,
    ),
  ]);
}

export function applicationForAdmin({ yaiName, contactName, email, link }) {
  return message(`New Become a Yai application: ${yaiName}`, [
    `${contactName} (${email}) applied for ${yaiName} to teach.`,
    `Review it: ${link}`,
  ]);
}

export function bookingConfirmed(booking) {
  const { name, dish, dishThai, yaiName, startsAt, endsAt, guests, total } =
    booking;
  return message(`You're booked: ${dish} with ${yaiName}`, [
    `Hi ${name},`,
    `You're cooking ${withThai(dish, dishThai)} with ${yaiName}.`,
    lines(
      `When: ${formatClassTime(startsAt, endsAt)}`,
      `Guests: ${guests}`,
      `Paid: ${formatMoney(total)}`,
    ),
    shoppingList(booking.ingredients),
    `Get ready for class, and tick off your shopping list as you go: ${booking.link}`,
    reminderPromise(booking.reminders),
  ]);
}

export function reminder(booking) {
  const { kind, name, dish, dishThai, yaiName, startsAt, endsAt, link } =
    booking;
  if (kind === "1h") {
    return message(`Starting in 1 hour: ${dish} with ${yaiName}`, [
      `Hi ${name},`,
      `Your class with ${yaiName} starts at ${formatTime(startsAt)} Thailand time, in about an hour.`,
      "Lay out your ingredients and join a few minutes early.",
      `Join from your Get Ready page: ${link}`,
    ]);
  }
  return message(`See you soon: ${dish} with ${yaiName}`, [
    `Hi ${name},`,
    `You're cooking ${withThai(dish, dishThai)} with ${yaiName}.`,
    `When: ${formatClassTime(startsAt, endsAt)}`,
    booking.ingredients?.length
      ? lines(
          "Have you got everything?",
          ...booking.ingredients.map(ingredientLine),
        )
      : null,
    `Get ready: ${link}`,
  ]);
}

const CANCELLED_BECAUSE = {
  tourist: (booking) =>
    `As you asked, we've cancelled your booking for ${whichClass(booking)}.`,
  admin: (booking) =>
    `We're sorry, we had to cancel your booking for ${whichClass(booking)}.`,
  class_time_cancelled: ({ dish, yaiName, startsAt }) =>
    dish
      ? `We're sorry, ${yaiName} can't teach your ${dish} class on ${formatDate(startsAt)}, so we've cancelled your booking.`
      : `We're sorry, your class on ${formatDate(startsAt)} can't go ahead, so we've cancelled your booking.`,
  paid_after_expiry: (booking) =>
    `Your payment for ${whichClass(booking)} arrived after your seats were let go, so we couldn't keep the booking.`,
};

export function bookingCancelled(booking) {
  const { name, dish, yaiName, cancelledBy, refund } = booking;
  const because = CANCELLED_BECAUSE[cancelledBy] ?? CANCELLED_BECAUSE.admin;
  return message(
    dish
      ? `Booking cancelled: ${dish} with ${yaiName}`
      : "Your booking is cancelled",
    [
      `Hi ${name},`,
      because(booking),
      refund.amount > 0
        ? `We're refunding ${formatMoney(refund)} to the way you paid. We'll email you again once it's sent.`
        : "No money is due back for this booking.",
    ],
  );
}

export function paymentRefunded(booking) {
  return message("Your refund is on its way", [
    `Hi ${booking.name},`,
    `We've sent back ${formatMoney(booking.amount)} for your booking of ${whichClass(booking)}.`,
    "It goes back the way you paid. Your bank may take a few days to show it.",
  ]);
}

export function afterClass({ name, dish, dishThai, yaiName, link }) {
  return message(`Thank you for cooking with ${yaiName}`, [
    `Hi ${name},`,
    `Thank you for cooking ${withThai(dish, dishThai)} with ${yaiName} today.`,
    `Your recipe card is waiting on the After Class page, where you can also rate the class: ${link}`,
  ]);
}

export function recordingReady({ name, dish, yaiName, deleteAfter, link }) {
  return message("Your class recording is ready", [
    `Hi ${name},`,
    `The recording of your ${dish} class with ${yaiName} is ready. Watch it on the After Class page: ${link}`,
    `It stays there until ${formatDate(deleteAfter)}.`,
  ]);
}
