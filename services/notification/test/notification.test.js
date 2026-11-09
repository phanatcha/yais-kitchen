import { createLogger, MAX_ATTEMPTS } from "@yais-kitchen/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SAMPLE_CLASS_TIME,
  SAMPLE_TYPES,
  sampleBooking,
  sampleData,
} from "../scripts/samples.js";
import { createLinks } from "../src/links.js";
import { createNotification } from "../src/notification.js";
import { createStore } from "../src/store.js";
import {
  fakeCatalog,
  fakeMailer,
  makeEvent,
  startDatabase,
} from "./helpers.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const CLASS_STARTS = new Date(sampleBooking().startsAt);
const logger = createLogger({ service: "notification-test", level: "silent" });

const friend = sampleBooking({
  bookingId: "6650a1f2c3d4e5f6a7b8c9f1",
  userId: "6650a1f2c3d4e5f6a7b8c9f2",
  email: "friend@example.com",
  name: "Kim",
});

let database;
let store;
let clock;
let mailer;
let catalog;
let notification;
const now = () => clock;

beforeAll(async () => {
  database = await startDatabase();
  store = createStore(database.connection, { now });
  await store.init();
}, 120_000);

afterAll(() => database?.stop());

beforeEach(async () => {
  clock = new Date(CLASS_STARTS.getTime() - 72 * HOUR);
  await Promise.all(
    Object.values(store.models).map((model) => model.deleteMany({})),
  );
  mailer = fakeMailer();
  catalog = fakeCatalog(SAMPLE_CLASS_TIME);
  notification = createNotification({
    store,
    mailer,
    catalog,
    links: createLinks("http://localhost:5173"),
    adminEmail: "admin@example.com",
    logger,
    now,
  });
});

const event = (type, options) =>
  makeEvent(type, sampleData(type, { now: clock, ...options }), clock);
const deliver = (each, attempt = 1) =>
  notification.handlers[each.type](each, { attempt });
const subjects = () => mailer.sent.map((email) => email.subject);
const reminderStatuses = async () =>
  (await store.models.Reminder.find().sort({ sendAt: 1 }).lean()).map(
    (reminder) => [reminder.kind, reminder.status],
  );

describe("sign-in code", () => {
  it("emails the code and when it stops working", async () => {
    await deliver(event("auth.code_requested"));

    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email.to).toBe("guest@example.com");
    expect(email.subject).toBe("Your Yai's Kitchen sign-in code");
    expect(email.text).toContain("\n482913\n");
    expect(email.text).toContain("It works until 4:10 pm Thailand time.");
  });

  it("keeps neither the code nor the address", async () => {
    await deliver(event("auth.code_requested"));
    const kept = JSON.stringify(
      await Promise.all(
        Object.values(store.models).map((model) => model.find().lean()),
      ),
    );
    expect(kept).not.toContain("482913");
    expect(kept).not.toContain("guest@example.com");
  });

  it("doesn't send a code that ran out before it could go", async () => {
    const late = event("auth.code_requested");
    clock = new Date(clock.getTime() + 11 * MINUTE);
    await deliver(late);
    expect(mailer.sent).toEqual([]);
  });
});

describe("Become a Yai application", () => {
  it("thanks the family and tells Admin", async () => {
    await deliver(event("application.received"));

    expect(mailer.sent.map((email) => [email.to, email.subject])).toEqual([
      ["family@example.com", "We got the application for Yai Malai"],
      ["admin@example.com", "New Become a Yai application: Yai Malai"],
    ]);
    expect(mailer.sent[0].text).toContain("Hi Sam,");
    expect(mailer.sent[1].text).toContain(
      "http://localhost:5173/admin/applications/6650a1f2c3d4e5f6a7b8c9e5",
    );
  });

  it("sends only what is missing when it is tried again", async () => {
    const application = event("application.received");
    const send = mailer.send;
    let calls = 0;
    mailer.send = async (email) => {
      calls += 1;
      if (calls === 2) throw new Error("SMTP is down");
      return send(email);
    };

    await expect(deliver(application)).rejects.toThrow("SMTP is down");
    await deliver(application, 2);

    expect(mailer.sent.map((email) => email.to)).toEqual([
      "family@example.com",
      "admin@example.com",
    ]);
  });
});

describe("booking confirmed", () => {
  it("emails the booking with the Thai dish name and the shopping list", async () => {
    await deliver(event("booking.confirmed"));

    expect(catalog.calls).toEqual(["6650a1f2c3d4e5f6a7b8c9e2"]);
    const [email] = mailer.sent;
    expect(email.to).toBe("guest@example.com");
    expect(email.subject).toBe("You're booked: Khao Soi with Yai Somsri");
    for (const line of [
      "Hi Alex,",
      "You're cooking Khao Soi (ข้าวซอย) with Yai Somsri.",
      "When: Friday 20 November 2026, 4:00 pm to 5:30 pm (Thailand time)",
      "Guests: 2",
      "Paid: THB 1,800",
      "- Fresh egg noodles (บะหมี่ไข่): 200 g",
      "- Coconut milk (กะทิ): 400 ml",
      "http://localhost:5173/bookings/6650a1f2c3d4e5f6a7b8c9e1/get-ready",
      "We'll remind you a day before class and again an hour before.",
    ]) {
      expect(email.text).toContain(line);
    }
  });

  it("plans reminders 24 hours and 1 hour before class", async () => {
    await deliver(event("booking.confirmed"));

    const reminders = await store.models.Reminder.find()
      .sort({ sendAt: 1 })
      .lean();
    expect(
      reminders.map((reminder) => [
        reminder.kind,
        reminder.sendAt.toISOString(),
        reminder.status,
      ]),
    ).toEqual([
      ["24h", "2026-11-19T09:00:00.000Z", "pending"],
      ["1h", "2026-11-20T08:00:00.000Z", "pending"],
    ]);
  });

  it("plans only the reminders still ahead, and says so", async () => {
    clock = new Date(CLASS_STARTS.getTime() - 5 * HOUR);
    await deliver(event("booking.confirmed"));

    expect(await reminderStatuses()).toEqual([["1h", "pending"]]);
    expect(mailer.sent[0].text).toContain(
      "We'll remind you an hour before class.",
    );
  });

  it("tries again while catalog is down, and on the last try sends without the list", async () => {
    catalog.answer = new Error("catalog is down");
    const confirmed = event("booking.confirmed");

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      await expect(deliver(confirmed, attempt)).rejects.toThrow(
        "catalog is down",
      );
    }
    expect(mailer.sent).toEqual([]);

    await deliver(confirmed, MAX_ATTEMPTS);
    expect(mailer.sent[0].text).toContain(
      "You're cooking Khao Soi with Yai Somsri.",
    );
    expect(mailer.sent[0].text).toContain(
      "Your shopping list is on the Get Ready page.",
    );
  });

  it("sends without the list if catalog doesn't know the class time", async () => {
    catalog.answer = null;
    await deliver(event("booking.confirmed"));
    expect(mailer.sent[0].text).toContain(
      "Your shopping list is on the Get Ready page.",
    );
  });
});

describe("booking cancelled", () => {
  it("cancels the reminders and tells the tourist about the refund", async () => {
    await deliver(event("booking.confirmed"));
    await deliver(event("booking.cancelled"));

    expect(subjects()).toEqual([
      "You're booked: Khao Soi with Yai Somsri",
      "Booking cancelled: Khao Soi with Yai Somsri",
    ]);
    expect(mailer.sent[1].text).toContain(
      "As you asked, we've cancelled your booking for Khao Soi with Yai Somsri on Friday 20 November 2026.",
    );
    expect(mailer.sent[1].text).toContain("We're refunding THB 1,800");
    expect(await reminderStatuses()).toEqual([
      ["24h", "cancelled"],
      ["1h", "cancelled"],
    ]);
  });

  it("sends no confirmation or reminders if the cancellation got here first", async () => {
    await deliver(event("booking.cancelled"));
    await deliver(event("booking.confirmed"));

    expect(subjects()).toEqual(["Your booking is cancelled"]);
    expect(await reminderStatuses()).toEqual([]);
  });
});

describe("refund", () => {
  it("tells the tourist the money is on its way", async () => {
    await deliver(event("booking.confirmed"));
    await deliver(event("booking.cancelled"));
    await deliver(event("payment.refunded"));

    const email = mailer.sent.at(-1);
    expect(email).toMatchObject({
      to: "guest@example.com",
      subject: "Your refund is on its way",
    });
    expect(email.text).toContain(
      "We've sent back THB 1,800 for your booking of Khao Soi with Yai Somsri on Friday 20 November 2026.",
    );
  });

  it("tries again if the cancellation hasn't arrived yet", async () => {
    await expect(deliver(event("payment.refunded"))).rejects.toThrow(
      "No booking is known",
    );
  });
});

describe("after class", () => {
  const leaving = sampleBooking({
    bookingId: "6650a1f2c3d4e5f6a7b8c9f3",
    userId: "6650a1f2c3d4e5f6a7b8c9f4",
    email: "gone@example.com",
    name: "Jo",
  });

  beforeEach(async () => {
    for (const booking of [sampleBooking(), friend, leaving]) {
      await deliver(event("booking.confirmed", { booking }));
    }
    await deliver(event("booking.cancelled", { booking: leaving }));
    mailer.sent = [];
  });

  it("emails every tourist who came a link to After Class", async () => {
    await deliver(event("live_class.ended"));

    expect(mailer.sent.map((email) => email.to)).toEqual([
      "guest@example.com",
      "friend@example.com",
    ]);
    expect(mailer.sent[0].subject).toBe(
      "Thank you for cooking with Yai Somsri",
    );
    expect(mailer.sent[0].text).toContain(
      "http://localhost:5173/bookings/6650a1f2c3d4e5f6a7b8c9e1/after-class",
    );
  });

  it("tells them when the recording is ready, and how long it stays", async () => {
    await deliver(event("recording.ready"));

    expect(mailer.sent.map((email) => email.to)).toEqual([
      "guest@example.com",
      "friend@example.com",
    ]);
    expect(mailer.sent[1].subject).toBe("Your class recording is ready");
    expect(mailer.sent[1].text).toContain(
      "It stays there until Thursday 18 February 2027.",
    );
  });
});

describe("account deleted", () => {
  it("forgets that person's bookings, reminders and email log, and nobody else's", async () => {
    await deliver(event("booking.confirmed"));
    await deliver(event("booking.confirmed", { booking: friend }));

    await deliver(event("user.deleted"));

    const { Booking, Reminder, SentEmail } = store.models;
    for (const model of [Booking, Reminder, SentEmail]) {
      expect(await model.find().distinct("userId")).toEqual([friend.userId]);
    }
  });
});

describe("repeated events", () => {
  it("sends nothing the second time, whatever the event", async () => {
    for (const type of SAMPLE_TYPES) {
      const each = event(type);
      await deliver(each);
      const sent = mailer.sent.length;
      await deliver(each);
      expect(mailer.sent.length, type).toBe(sent);
    }
    // Code, application (family and Admin), booked, after class, recording,
    // cancelled, refund.
    expect(subjects()).toHaveLength(8);
  });

  it("sends one email when two copies arrive at the same time", async () => {
    const code = event("auth.code_requested");

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => deliver(code)),
    );

    expect(mailer.sent).toHaveLength(1);
    // A copy that finds the email still being sent fails, so it is tried
    // again later. One that finds it sent is done.
    for (const result of results.filter(
      ({ status }) => status === "rejected",
    )) {
      expect(result.reason.message).toContain("Another copy");
    }
    await deliver(code, 2);
    expect(mailer.sent).toHaveLength(1);
  });

  it("takes over an email whose sender died partway", async () => {
    const code = event("auth.code_requested");
    await store.claimEmail(`${code.id}:sign_in_code`, {
      template: "sign_in_code",
    });

    await expect(deliver(code, 2)).rejects.toThrow("Another copy");
    expect(mailer.sent).toEqual([]);

    clock = new Date(clock.getTime() + 2 * MINUTE);
    await deliver(code, 3);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("reminders", () => {
  const sendDue = () => notification.reminders.sendDue();
  const at = (beforeClass) => new Date(CLASS_STARTS.getTime() - beforeClass);

  beforeEach(async () => {
    await deliver(event("booking.confirmed"));
    mailer.sent = [];
  });

  it("sends each reminder when it is due, once", async () => {
    await sendDue();
    expect(mailer.sent).toEqual([]);

    clock = at(24 * HOUR);
    await sendDue();
    await sendDue();
    expect(subjects()).toEqual(["See you soon: Khao Soi with Yai Somsri"]);
    expect(mailer.sent[0].text).toContain(
      "When: Friday 20 November 2026, 4:00 pm to 5:30 pm (Thailand time)",
    );
    expect(mailer.sent[0].text).toContain(
      "- Fresh egg noodles (บะหมี่ไข่): 200 g",
    );

    clock = at(HOUR);
    await sendDue();
    expect(subjects()).toEqual([
      "See you soon: Khao Soi with Yai Somsri",
      "Starting in 1 hour: Khao Soi with Yai Somsri",
    ]);
    expect(mailer.sent[1].text).toContain(
      "starts at 4:00 pm Thailand time, in about an hour.",
    );
    expect(await reminderStatuses()).toEqual([
      ["24h", "sent"],
      ["1h", "sent"],
    ]);
  });

  it("sends none for a cancelled booking", async () => {
    await deliver(event("booking.cancelled"));
    mailer.sent = [];

    clock = at(HOUR);
    await sendDue();

    expect(mailer.sent).toEqual([]);
  });

  it("skips reminders whose moment has passed, so none arrive after class", async () => {
    clock = new Date(CLASS_STARTS.getTime() + MINUTE);
    await sendDue();

    expect(mailer.sent).toEqual([]);
    expect(await reminderStatuses()).toEqual([
      ["24h", "skipped"],
      ["1h", "skipped"],
    ]);
  });

  it("tries a failing reminder again later, and gives up after 5 tries", async () => {
    clock = at(24 * HOUR);
    mailer.failNext = MAX_ATTEMPTS;

    await sendDue();
    expect(
      await store.models.Reminder.findById(
        "6650a1f2c3d4e5f6a7b8c9e1:24h",
      ).lean(),
    ).toMatchObject({
      status: "pending",
      attempts: 1,
      sendAt: new Date(clock.getTime() + MINUTE),
    });

    for (let check = 1; check < MAX_ATTEMPTS; check += 1) {
      clock = new Date(clock.getTime() + 10 * MINUTE);
      await sendDue();
    }
    expect(
      await store.models.Reminder.findById(
        "6650a1f2c3d4e5f6a7b8c9e1:24h",
      ).lean(),
    ).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(mailer.sent).toEqual([]);
  });

  it("never sends one twice when several instances check at once", async () => {
    for (let n = 0; n < 6; n += 1) {
      const booking = sampleBooking({
        bookingId: `6650a1f2c3d4e5f6a7b8ca0${n}`,
        email: `guest${n}@example.com`,
      });
      await deliver(event("booking.confirmed", { booking }));
    }
    mailer.sent = [];
    clock = at(24 * HOUR);

    await Promise.all([sendDue(), sendDue(), sendDue()]);

    expect(mailer.sent).toHaveLength(7);
    expect(new Set(mailer.sent.map((email) => email.to)).size).toBe(7);
  });

  it("checks on a timer until stopped", async () => {
    clock = at(24 * HOUR);
    notification.reminders.start(5);
    await expect.poll(() => mailer.sent.length, { timeout: 5000 }).toBe(1);
    await notification.reminders.stop();
  });
});
