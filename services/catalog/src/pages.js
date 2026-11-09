import { badRequest } from "@yais-kitchen/shared";
import mongoose from "mongoose";

// Pages are read with a cursor: the last item of the page before. Sorting on
// a field plus `_id` keeps the order stable when two items share a time.

const ID = /^[a-f0-9]{24}$/;
const TIME_CURSOR = /^(\d{1,15})_([a-f0-9]{24})$/;
const badCursor = () =>
  badRequest(undefined, [
    { field: "cursor", message: "isn't a page of this list" },
  ]);

/** For lists in `_id` order. `newestFirst` reverses it. */
export function byId(cursor, { newestFirst = false } = {}) {
  if (cursor === undefined) return {};
  if (!ID.test(cursor)) throw badCursor();
  return { _id: { [newestFirst ? "$lt" : "$gt"]: cursor } };
}

/** For lists sorted by `startsAt`, then `_id`. */
export function byStart(cursor) {
  if (cursor === undefined) return {};
  const match = TIME_CURSOR.exec(cursor);
  if (!match) throw badCursor();
  const startsAt = new Date(Number(match[1]));
  return {
    $or: [
      { startsAt: { $gt: startsAt } },
      { startsAt, _id: { $gt: new mongoose.Types.ObjectId(match[2]) } },
    ],
  };
}

export const startCursor = (doc) =>
  `${doc.startsAt.getTime()}_${doc._id.toString()}`;

/**
 * Reads one page: one more than `limit`, to know if there is a next page.
 * @param {import("mongoose").Query} query Already filtered and sorted.
 */
export async function page(
  query,
  limit,
  cursorOf = (doc) => doc._id.toString(),
) {
  const docs = await query.limit(limit + 1).lean();
  const items = docs.slice(0, limit);
  return {
    items,
    nextCursor: docs.length > limit ? cursorOf(items.at(-1)) : null,
  };
}
