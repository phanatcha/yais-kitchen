import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { isAdmin } from "./catalog.js";
import { byStart, page, startCursor } from "./pages.js";

const HOUR_MS = 60 * 60 * 1000;
export const MAX_AVAILABLE_MS = 8 * HOUR_MS;
// Booking reads at most this many class times for one class at once.
const INTERNAL_LIST_MAX = 100;

const isId = (value) => mongoose.isValidObjectId(value);
const wrongField = (field, message) =>
  badRequest(undefined, [{ field, message }]);

/** A family manages only its own Yai. Admin manages every Yai. */
function checkYaiAccess(viewer, yaiId) {
  if (isAdmin(viewer)) return;
  if (viewer?.role === "family" && viewer.yaiId === yaiId) return;
  throw forbidden("You can only manage your own Yai's times.");
}

/**
 * When Yais can teach, and the class times Admin makes from them. A class
 * time is a draft until it has a helper; only published times can be booked.
 * @param {object} options
 * @param {ReturnType<typeof import("./store.js").createStore>} options.store
 * @param {ReturnType<typeof import("./views.js").createViews>} options.views
 * @param {{ publish: (type: string, data: object) => Promise<unknown> }} options.events
 * @param {() => Date} [options.now]
 */
export function createSchedule({
  store,
  views,
  events,
  now = () => new Date(),
}) {
  const { Yai, Class, AvailableTime, ClassTime } = store;

  function startRange(from, to) {
    return {
      startsAt: {
        $gte: from ? new Date(from) : now(),
        ...(to && { $lte: new Date(to) }),
      },
    };
  }

  async function findClassTime(id) {
    const doc = isId(id) ? await ClassTime.findById(id).lean() : null;
    if (!doc) throw notFound();
    return doc;
  }

  return {
    async listAvailableTimes(yaiId, { from, to, limit, cursor }, viewer) {
      checkYaiAccess(viewer, yaiId);
      const result = await page(
        AvailableTime.find({
          $and: [{ yaiId }, startRange(from, to), byStart(cursor)],
        }).sort({ startsAt: 1, _id: 1 }),
        limit,
        startCursor,
      );
      return {
        items: result.items.map(views.availableTime),
        nextCursor: result.nextCursor,
      };
    },

    async addAvailableTime(yaiId, input, viewer) {
      checkYaiAccess(viewer, yaiId);
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      if (startsAt <= now())
        throw wrongField("startsAt", "must be in the future");
      if (endsAt <= startsAt)
        throw wrongField("endsAt", "must be after startsAt");
      if (endsAt - startsAt > MAX_AVAILABLE_MS) {
        throw wrongField("endsAt", "must be at most 8 hours after startsAt");
      }
      if (!(await Yai.exists({ _id: yaiId }))) throw notFound();

      const overlap = await AvailableTime.exists({
        yaiId,
        startsAt: { $lt: endsAt },
        endsAt: { $gt: startsAt },
      });
      if (overlap) {
        throw conflict(
          "time_overlaps",
          "This overlaps another time she can teach.",
        );
      }
      const doc = await AvailableTime.create({ yaiId, startsAt, endsAt });
      return views.availableTime(doc.toObject());
    },

    async deleteAvailableTime(yaiId, id, viewer) {
      checkYaiAccess(viewer, yaiId);
      const doc = isId(id)
        ? await AvailableTime.findOne({ _id: id, yaiId }).lean()
        : null;
      if (!doc) throw notFound();
      const inUse = () =>
        conflict(
          "time_in_use",
          "Admin already made a class time from this, so it can't be removed.",
        );
      if (doc.classTimeId) throw inUse();
      const { deletedCount } = await AvailableTime.deleteOne({
        _id: id,
        classTimeId: null,
      });
      if (deletedCount !== 1) throw inUse();
    },

    async listClassTimes({ yaiId, status, from, to, limit, cursor }, viewer) {
      const conditions = [startRange(from, to), byStart(cursor)];
      if (viewer.role === "helper") conditions.push({ helperId: viewer.id });
      if (viewer.role === "family") {
        if (yaiId && yaiId !== viewer.yaiId) {
          throw forbidden("You can only see your own Yai's class times.");
        }
        yaiId = viewer.yaiId;
      }
      if (yaiId) conditions.push({ yaiId });
      if (status) conditions.push({ status });

      const result = await page(
        ClassTime.find({ $and: conditions }).sort({ startsAt: 1, _id: 1 }),
        limit,
        startCursor,
      );
      return {
        items: result.items.map(views.classTime),
        nextCursor: result.nextCursor,
      };
    },

    async createClassTime({ classId, availableTimeId, helperId }) {
      const theClass = isId(classId)
        ? await Class.findById(classId).lean()
        : null;
      if (!theClass) throw wrongField("classId", "isn't a class");
      const time = isId(availableTimeId)
        ? await AvailableTime.findById(availableTimeId).lean()
        : null;
      if (!time || !time.yaiId.equals(theClass.yaiId)) {
        throw wrongField("availableTimeId", "isn't a time of this class's Yai");
      }
      if (time.classTimeId) {
        throw conflict("time_in_use", "This time already has a class time.");
      }
      if (time.startsAt <= now()) {
        throw conflict("time_passed", "This time has already started.");
      }
      const startsAt = time.startsAt;
      const endsAt = new Date(
        startsAt.getTime() + theClass.durationMinutes * 60_000,
      );
      if (endsAt > time.endsAt) {
        throw conflict(
          "time_too_short",
          `This class takes ${theClass.durationMinutes} minutes, which doesn't fit in this time.`,
        );
      }

      // Claim the available time first, so two admins can't both use it.
      const id = new mongoose.Types.ObjectId();
      const claimed = await AvailableTime.updateOne(
        { _id: time._id, classTimeId: null },
        { $set: { classTimeId: id } },
      );
      if (claimed.modifiedCount !== 1) {
        throw conflict("time_in_use", "This time already has a class time.");
      }
      try {
        const doc = await ClassTime.create({
          _id: id,
          classId: theClass._id,
          yaiId: theClass.yaiId,
          availableTimeId: time._id,
          startsAt,
          endsAt,
          capacity: theClass.maxGuests,
          helperId: helperId ?? null,
          status: helperId ? "published" : "draft",
        });
        return views.classTime(doc.toObject());
      } catch (error) {
        await AvailableTime.updateOne(
          { _id: time._id, classTimeId: id },
          { $set: { classTimeId: null } },
        );
        throw error;
      }
    },

    async updateClassTime(id, { helperId, status }) {
      if (helperId && status) {
        throw badRequest("Send helperId or status, not both.");
      }
      const doc = await findClassTime(id);
      if (status === "cancelled" && doc.status === "cancelled") {
        return views.classTime(doc);
      }
      if (doc.status === "cancelled") {
        throw conflict(
          "class_time_cancelled",
          "This class time was cancelled.",
        );
      }
      if (doc.startsAt <= now()) {
        throw conflict("class_started", "This class time has already started.");
      }

      if (helperId) {
        const updated = await ClassTime.findOneAndUpdate(
          { _id: doc._id, status: { $ne: "cancelled" } },
          { $set: { helperId, status: "published" } },
          { returnDocument: "after", lean: true },
        );
        if (!updated) {
          throw conflict(
            "class_time_cancelled",
            "This class time was cancelled.",
          );
        }
        return views.classTime(updated);
      }

      const before = await ClassTime.findOneAndUpdate(
        { _id: doc._id, status: { $ne: "cancelled" } },
        { $set: { status: "cancelled" } },
        { lean: true },
      );
      if (!before) return views.classTime(await findClassTime(id));
      try {
        // Booking cancels and refunds every booking for it.
        await events.publish("class_time.cancelled", {
          classTimeId: doc._id.toString(),
          classId: doc.classId.toString(),
          yaiId: doc.yaiId.toString(),
          startsAt: doc.startsAt.toISOString(),
        });
      } catch (error) {
        // Nobody was told, so it isn't cancelled. Admin tries again.
        await ClassTime.updateOne(
          { _id: doc._id, status: "cancelled" },
          { $set: { status: before.status } },
        );
        throw error;
      }
      return views.classTime({ ...before, status: "cancelled" });
    },

    /** Published times of one class, for booking's time picker. */
    async internalListClassTimes({ classId, from, to }) {
      const docs = await ClassTime.find({
        classId,
        status: "published",
        ...startRange(from, to),
      })
        .sort({ startsAt: 1, _id: 1 })
        .limit(INTERNAL_LIST_MAX)
        .lean();
      return { items: docs.map(views.classTime) };
    },

    /** One class time in any status, with its class, Yai and ingredients. */
    async internalGetClassTime(id) {
      const doc = await findClassTime(id);
      const theClass = await Class.findById(doc.classId).lean();
      const yai = theClass && (await Yai.findById(theClass.yaiId).lean());
      if (!theClass || !yai) throw notFound();
      const prices = await Class.aggregate([
        { $match: { yaiId: yai._id, isVisible: true } },
        { $group: { _id: null, amount: { $min: "$price.amount" } } },
      ]);
      return {
        classTime: views.classTime(doc),
        class: views.classSummary(theClass, yai),
        yai: views.yaiSummary(yai, prices[0]?.amount),
        ingredients: (theClass.recipe?.ingredients ?? []).map(views.ingredient),
      };
    },
  };
}
