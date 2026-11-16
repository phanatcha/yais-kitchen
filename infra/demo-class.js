// npm run demo:class: a fresh live class for a demo, starting in 5 minutes.
// Joining opens 10 minutes before the start, so everyone can join at once.
//   - The demo accounts, made if missing: a guest, a helper and the Yai's
//     family. They sign in with codes from Mailpit, like anyone else.
//   - A demo Yai and her class, with a recipe. They show on Browse like any
//     other, because live-class reads the recipe the way the public does.
//   - A published class time with the helper.
//   - A booking for the guest, paid as if Stripe had said so: booking gets a
//     `payment.succeeded` event, confirms it and emails the guest and family.
// It writes to the local databases directly, like the catalog seed, so it is
// for a machine running `npm run up` or `npm run demo` only. Run it again for
// another class whenever the last one has ended.
import { randomUUID } from "node:crypto";
import {
  createDurable,
  internalClient,
  loadConfig,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createStore as createAuthStore } from "../services/auth/src/store.js";
import { createStore as createBookingStore } from "../services/booking/src/models/store.js";
import { createBookingService } from "../services/booking/src/services/booking.js";
import { createStore as createCatalogStore } from "../services/catalog/src/store.js";
import { lanAddress } from "./lan.js";

const config = loadConfig({
  MONGO_URL: { type: "url" },
  INTERNAL_TOKEN: {},
  CATALOG_URL: { type: "url", default: "http://127.0.0.1:3002" },
});

const MINUTE = 60_000;
const PHOTO = "6650a1f2c3d4e5f6a7b8c9a1";
const ACCOUNTS = {
  guest: { email: "guest@example.com", name: "Alex", role: "tourist" },
  helper: { email: "helper@example.com", name: "Nok", role: "helper" },
  family: { email: "yai@example.com", name: "Malee", role: "family" },
};
const YAI = {
  name: "Yai Lamduan",
  nameThai: "ยายลำดวน",
  region: "central",
  story:
    "Yai Lamduan teaches the live class demo from her kitchen outside Bangkok.",
};
const CLASS = {
  dish: "Green Curry",
  dishThai: "แกงเขียวหวาน",
  description: "Green curry with chicken and Thai basil, the way Yai makes it.",
  price: { amount: 90000, currency: "THB" },
  durationMinutes: 90,
  maxGuests: 6,
  recipe: {
    ingredients: [
      {
        id: "paste",
        name: "Green curry paste",
        nameThai: "พริกแกงเขียวหวาน",
        quantity: "3 tbsp",
      },
      {
        id: "coconut",
        name: "Coconut milk",
        nameThai: "กะทิ",
        quantity: "400 ml",
      },
      {
        id: "chicken",
        name: "Chicken thighs",
        nameThai: "สะโพกไก่",
        quantity: "300 g",
      },
      {
        id: "eggplant",
        name: "Thai eggplants",
        nameThai: "มะเขือเปราะ",
        quantity: "4",
      },
      {
        id: "basil",
        name: "Thai basil",
        nameThai: "ใบโหระพา",
        quantity: "1 handful",
      },
    ],
    steps: [
      {
        text: "Fry the curry paste in the thick coconut cream until it smells fragrant.",
      },
      {
        text: "Add the chicken and stir until it is coated and no longer pink outside.",
      },
      {
        text: "Pour in the rest of the coconut milk and bring it to a gentle boil.",
      },
      { text: "Add the eggplants and simmer for 10 minutes." },
      {
        text: "Season with fish sauce and palm sugar, then stir in the basil.",
      },
    ],
    yaiTip:
      "Don't let the paste burn. Keep stirring and lower the heat if it spits.",
  },
};

const connect = (dbName) =>
  mongoose
    .createConnection(config.MONGO_URL, {
      dbName,
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();

const authConnection = await connect("auth");
const catalogConnection = await connect("catalog");
const bookingConnection = await connect("booking");

try {
  const auth = createAuthStore(authConnection);
  const catalog = createCatalogStore(catalogConnection);
  const booking = createBookingStore(bookingConnection);
  await Promise.all([auth.init(), catalog.init(), booking.init()]);
  const now = new Date();

  // The demo Yai and class, made once.
  const yai =
    (await catalog.Yai.findOne({ name: YAI.name, isSample: false })) ??
    (await catalog.Yai.create({
      ...YAI,
      photos: [{ assetId: PHOTO }],
      isSample: false,
      isVisible: true,
      isFeatured: false,
      createdAt: now,
    }));
  const theClass =
    (await catalog.Class.findOne({ yaiId: yai._id, dish: CLASS.dish })) ??
    (await catalog.Class.create({
      ...CLASS,
      yaiId: yai._id,
      photo: { assetId: PHOTO },
      isVisible: true,
      isFeatured: false,
      createdAt: now,
    }));

  // The demo accounts, made once. An email that already has another role
  // is left alone, and the script stops.
  const users = {};
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const user = await auth.User.findOneAndUpdate(
      { email: account.email },
      {
        $setOnInsert: {
          ...account,
          ...(account.role === "family" && { yaiId: yai._id.toString() }),
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after", lean: true },
    );
    if (user.role !== account.role) {
      throw new Error(
        `${account.email} is already a ${user.role} account. Change it on the Admin Accounts page, then run this again.`,
      );
    }
    if (user.disabledAt) {
      throw new Error(`${account.email} is turned off. Turn it on first.`);
    }
    users[key] = user;
  }
  if (users.family.yaiId !== yai._id.toString()) {
    await auth.User.updateOne(
      { _id: users.family._id },
      { $set: { yaiId: yai._id.toString() } },
    );
  }

  // A class time starting in 5 minutes, on the minute.
  const startsAt = new Date(
    Math.ceil((now.getTime() + 5 * MINUTE) / MINUTE) * MINUTE,
  );
  const endsAt = new Date(startsAt.getTime() + CLASS.durationMinutes * MINUTE);
  const classTimeId = new mongoose.Types.ObjectId();
  const time = await catalog.AvailableTime.create({
    yaiId: yai._id,
    startsAt,
    endsAt,
    classTimeId,
  });
  await catalog.ClassTime.create({
    _id: classTimeId,
    classId: theClass._id,
    yaiId: yai._id,
    availableTimeId: time._id,
    startsAt,
    endsAt,
    capacity: CLASS.maxGuests,
    helperId: users.helper._id.toString(),
    status: "published",
  });

  // The guest books two seats through booking's own rules, then the payment
  // arrives the way payment would send it.
  const bookings = createBookingService({
    store: booking,
    durable: createDurable(bookingConnection),
    catalog: internalClient(config.CATALOG_URL, config.INTERNAL_TOKEN),
  });
  const guest = users.guest;
  const hold = await bookings.hold(
    { classTimeId: classTimeId.toString(), guests: 2 },
    randomUUID(),
  );
  const made = await bookings.create(
    hold.id,
    {
      id: guest._id.toString(),
      role: "tourist",
      email: guest.email,
      name: guest.name,
    },
    { language: "en", cookingExperience: "some" },
  );
  await bookings.handlers["payment.succeeded"]({
    id: randomUUID(),
    type: "payment.succeeded",
    occurredAt: new Date().toISOString(),
    version: 1,
    data: {
      paymentId: new mongoose.Types.ObjectId().toString(),
      bookingId: made.id,
      amount: made.total,
      method: "card",
    },
  });

  const site = `https://${lanAddress() ?? "localhost"}:5173`;
  const time24 = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  console.log(`
Demo class: ${CLASS.dish} with ${YAI.name}, ${time24.format(startsAt)} to ${time24.format(endsAt)} Thailand time. Joining is open now.

On each laptop, open ${site}, accept the certificate warning once, and
sign in. Codes arrive in Mailpit on this laptop: http://localhost:8025

  Guest          ${ACCOUNTS.guest.email.padEnd(20)} ${site}/my-classes/${made.id}/live
  Helper         ${ACCOUNTS.helper.email.padEnd(20)} ${site}/helper/classes/${classTimeId}/live
  Yai's kitchen  ${ACCOUNTS.family.email.padEnd(20)} ${site}/family/classes/${classTimeId}/live
`);
} finally {
  await Promise.all([
    authConnection.close(),
    catalogConnection.close(),
    bookingConnection.close(),
  ]);
}
