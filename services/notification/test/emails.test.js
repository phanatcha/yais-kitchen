import { describe, expect, it } from "vitest";
import { sampleBooking, sampleData } from "../scripts/samples.js";
import * as emails from "../src/emails.js";
import { formatDate, formatMoney, formatTime } from "../src/format.js";

describe("formatting", () => {
  it("shows Thai time, which is UTC+7 all year", () => {
    expect(formatTime("2026-11-20T09:00:00Z")).toBe("4:00 pm");
    expect(formatTime("2026-11-20T05:00:00Z")).toBe("12:00 pm");
    expect(formatTime("2026-11-20T17:30:00Z")).toBe("12:30 am");
    expect(formatTime("2026-06-20T00:05:00Z")).toBe("7:05 am");
    expect(formatDate("2026-11-20T17:30:00Z")).toBe(
      "Saturday 21 November 2026",
    );
  });

  it("turns satang into baht", () => {
    expect(formatMoney({ amount: 180000, currency: "THB" })).toBe("THB 1,800");
    expect(formatMoney({ amount: 90050, currency: "THB" })).toBe("THB 900.50");
    expect(formatMoney({ amount: 0, currency: "THB" })).toBe("THB 0");
  });
});

describe("templates", () => {
  const booking = {
    ...sampleBooking(),
    dishThai: "ข้าวซอย",
    ingredients: [],
    link: "http://localhost:5173/x",
  };

  const all = {
    signInCode: emails.signInCode(sampleData("auth.code_requested")),
    applicationReceived: emails.applicationReceived(
      sampleData("application.received"),
    ),
    applicationForAdmin: emails.applicationForAdmin({
      ...sampleData("application.received"),
      link: booking.link,
    }),
    bookingConfirmed: emails.bookingConfirmed(booking),
    reminder24h: emails.reminder({ ...booking, kind: "24h" }),
    reminder1h: emails.reminder({ ...booking, kind: "1h" }),
    bookingCancelled: emails.bookingCancelled({
      ...booking,
      ...sampleData("booking.cancelled"),
    }),
    paymentRefunded: emails.paymentRefunded({
      ...booking,
      amount: booking.total,
    }),
    afterClass: emails.afterClass(booking),
    recordingReady: emails.recordingReady({
      ...booking,
      ...sampleData("recording.ready"),
    }),
  };

  it.each(Object.entries(all))(
    "%s has a subject, a greeting or code, and nothing missing",
    (name, email) => {
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.subject).not.toMatch(/\n/);
      expect(email.text).not.toMatch(/undefined|null|NaN|\[object/);
      expect(email.text.trimEnd().endsWith("Yai's Kitchen")).toBe(true);
    },
  );

  it("keeps a name with a line break out of the subject's headers", () => {
    const email = emails.applicationForAdmin({
      ...sampleData("application.received"),
      yaiName: "Yai\r\nBcc: someone@example.com",
      link: booking.link,
    });
    expect(email.subject).toBe(
      "New Become a Yai application: Yai Bcc: someone@example.com",
    );
  });

  it("says why a booking was cancelled", () => {
    const because = (cancelledBy, refund = booking.total) =>
      emails.bookingCancelled({ ...booking, cancelledBy, refund }).text;

    expect(because("tourist")).toContain("As you asked");
    expect(because("admin")).toContain("we had to cancel");
    expect(because("class_time_cancelled")).toContain(
      "We're sorry, Yai Somsri can't teach your Khao Soi class on Friday 20 November 2026, so we've cancelled your booking.",
    );
    expect(because("paid_after_expiry")).toContain(
      "arrived after your seats were let go",
    );
    expect(because("admin", { amount: 0, currency: "THB" })).toContain(
      "No money is due back",
    );
  });
});
