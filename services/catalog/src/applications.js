import { conflict, notFound } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { byId, page } from "./pages.js";

// Where an application may go from each stage.
export const NEXT_STAGES = {
  received: ["kitchen_visit", "declined"],
  kitchen_visit: ["trial_class", "declined"],
  trial_class: ["approved", "declined"],
  approved: [],
  declined: [],
};

/**
 * Become a Yai applications: families apply, Admin moves them along.
 * @param {object} options
 * @param {ReturnType<typeof import("./store.js").createStore>} options.store
 * @param {ReturnType<typeof import("./views.js").createViews>} options.views
 * @param {{ publish: (type: string, data: object) => Promise<unknown> }} options.events
 * @param {() => Date} [options.now]
 */
export function createApplications({
  store,
  views,
  events,
  now = () => new Date(),
}) {
  const { Application } = store;

  return {
    async submit(input) {
      const doc = await Application.create({
        stage: "received",
        yaiName: input.yaiName.trim(),
        contactName: input.contactName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        region: input.region,
        dishes: input.dishes,
        message: input.message,
        createdAt: now(),
      });
      try {
        // Notification thanks the family and tells Admin.
        await events.publish("application.received", {
          applicationId: doc._id.toString(),
          yaiName: doc.yaiName,
          contactName: doc.contactName,
          email: doc.email,
        });
      } catch (error) {
        // Nobody would hear about it, so it isn't kept. The family sends again.
        await Application.deleteOne({ _id: doc._id });
        throw error;
      }
      return { id: doc._id.toString() };
    },

    async list({ stage, limit, cursor }) {
      const result = await page(
        Application.find({
          ...byId(cursor, { newestFirst: true }),
          ...(stage && { stage }),
        }).sort({ _id: -1 }),
        limit,
      );
      return {
        items: result.items.map(views.application),
        nextCursor: result.nextCursor,
      };
    },

    async update(id, { stage, notes }) {
      const doc = mongoose.isValidObjectId(id)
        ? await Application.findById(id).lean()
        : null;
      if (!doc) throw notFound();
      const notAllowed = () =>
        conflict(
          "stage_not_allowed",
          `An application at ${doc.stage} can't move to ${stage}.`,
        );
      if (
        stage &&
        stage !== doc.stage &&
        !NEXT_STAGES[doc.stage].includes(stage)
      ) {
        throw notAllowed();
      }
      // Only if nobody moved it in the meantime.
      const updated = await Application.findOneAndUpdate(
        { _id: doc._id, stage: doc.stage },
        {
          $set: {
            ...(stage && { stage }),
            ...(notes !== undefined && { notes }),
          },
        },
        { returnDocument: "after", lean: true },
      );
      if (!updated) {
        throw conflict(
          "stage_not_allowed",
          "Someone else just moved this application. Reload it and try again.",
        );
      }
      return views.application(updated);
    },
  };
}
