// Sample event data, as asyncapi.yaml describes it. The tests and
// `npm run send-sample` both use it. Every person and address is made up.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields of booking.confirmed. */
export function sampleBooking(overrides = {}) {
  return {
    bookingId: "6650a1f2c3d4e5f6a7b8c9e1",
    userId: "6650a1f2c3d4e5f6a7b8c9d0",
    email: "guest@example.com",
    name: "Alex",
    classTimeId: "6650a1f2c3d4e5f6a7b8c9e2",
    classId: "6650a1f2c3d4e5f6a7b8c9e3",
    yaiId: "6650a1f2c3d4e5f6a7b8c9e4",
    yaiName: "Yai Somsri",
    dish: "Khao Soi",
    startsAt: "2026-11-20T09:00:00.000Z",
    endsAt: "2026-11-20T10:30:00.000Z",
    guests: 2,
    total: { amount: 180000, currency: "THB" },
    ...overrides,
  };
}

/** The helper and family member auth knows about in the samples. */
export const SAMPLE_HELPER = {
  id: "6650a1f2c3d4e5f6a7b8c9f5",
  email: "helper@example.com",
  name: "Nok",
  role: "helper",
  disabled: false,
};
export const SAMPLE_FAMILY = {
  id: "6650a1f2c3d4e5f6a7b8c9f6",
  email: "somsri.family@example.com",
  name: "Ploy",
  role: "family",
  yaiId: "6650a1f2c3d4e5f6a7b8c9e4",
  disabled: false,
};

/** What catalog's internal class-time endpoint gives for the sample. */
export const SAMPLE_CLASS_TIME = {
  dishThai: "ข้าวซอย",
  ingredients: [
    { name: "Fresh egg noodles", nameThai: "บะหมี่ไข่", quantity: "200 g" },
    { name: "Chicken thighs", nameThai: "สะโพกไก่", quantity: "300 g" },
    { name: "Coconut milk", nameThai: "กะทิ", quantity: "400 ml" },
  ],
};

/**
 * The `data` of each event notification handles.
 * @param {string} type
 * @param {{ booking?: object, now?: Date }} [options]
 */
export function sampleData(
  type,
  { booking = sampleBooking(), now = new Date() } = {},
) {
  const { bookingId, userId, email, name, classTimeId, startsAt } = booking;
  switch (type) {
    case "auth.code_requested":
      return {
        email,
        code: "482913",
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      };
    case "application.received":
      return {
        applicationId: "6650a1f2c3d4e5f6a7b8c9e5",
        yaiName: "Yai Malai",
        contactName: "Sam",
        email: "family@example.com",
      };
    case "booking.confirmed":
      return booking;
    case "booking.cancelled":
      return {
        bookingId,
        userId,
        email,
        name,
        classTimeId,
        startsAt,
        cancelledBy: "tourist",
        refund: booking.total,
      };
    case "payment.refunded":
      return {
        paymentId: "6650a1f2c3d4e5f6a7b8c9e6",
        bookingId,
        amount: booking.total,
      };
    case "live_class.ended":
      return { classTimeId, endedAt: booking.endsAt };
    case "recording.ready":
      return {
        classTimeId,
        objectKey: `recordings/${classTimeId}.mp4`,
        durationSeconds: 5400,
        deleteAfter: new Date(
          new Date(startsAt).getTime() + 90 * DAY_MS,
        ).toISOString(),
      };
    case "booking.expired": {
      const { total, ...rest } = booking;
      void total;
      return rest;
    }
    case "class_time.helper_assigned":
      return {
        classTimeId,
        classId: booking.classId,
        yaiId: booking.yaiId,
        helperId: SAMPLE_HELPER.id,
        startsAt,
        endsAt: booking.endsAt,
        dish: booking.dish,
        yaiName: booking.yaiName,
      };
    case "class_time.cancelled":
      return {
        classTimeId,
        classId: booking.classId,
        yaiId: booking.yaiId,
        startsAt,
        endsAt: booking.endsAt,
        helperId: SAMPLE_HELPER.id,
        dish: booking.dish,
        yaiName: booking.yaiName,
      };
    case "payout.paid":
      return {
        payoutId: "6650a1f2c3d4e5f6a7b8c9e7",
        yaiId: booking.yaiId,
        yaiName: booking.yaiName,
        periodStart: "2026-11-16",
        periodEnd: "2026-11-22",
        amount: { amount: 135000, currency: "THB" },
        bookings: 1,
        reference: "PP20261122-0042",
        paidAt: new Date(now.getTime()).toISOString(),
      };
    case "user.deleted":
      return { userId };
    default:
      throw new TypeError(`No sample for "${type}".`);
  }
}

/** Every event notification handles, in the order a booking lives through them. */
export const SAMPLE_TYPES = [
  "auth.code_requested",
  "application.received",
  "booking.confirmed",
  "live_class.ended",
  "recording.ready",
  "booking.cancelled",
  "payment.refunded",
  "booking.expired",
  "class_time.helper_assigned",
  "class_time.cancelled",
  "payout.paid",
  "user.deleted",
];
