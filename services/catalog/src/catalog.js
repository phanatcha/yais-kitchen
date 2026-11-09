import { badRequest, notFound } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { byId, page } from "./pages.js";

export const isAdmin = (viewer) => viewer?.role === "admin";
const isId = (value) => mongoose.isValidObjectId(value);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const search = (q) => new RegExp(escape(q.trim()), "i");

function photosFrom(assetIds, alts = [], fieldPrefix = "photo") {
  if (alts.length > assetIds.length) {
    throw badRequest(undefined, [
      { field: `${fieldPrefix}Alts`, message: "has more entries than photos" },
    ]);
  }
  return assetIds.map((assetId, i) => ({ assetId, alt: alts[i] }));
}

/**
 * Yais, classes, recipes and the FAQ: what tourists browse, and Admin edits.
 * Hidden things are hidden from everyone except Admin. A class of a hidden
 * Yai is hidden too.
 * @param {{ store: ReturnType<typeof import("./store.js").createStore>, views: ReturnType<typeof import("./views.js").createViews>, now?: () => Date }} options
 */
export function createCatalog({ store, views, now = () => new Date() }) {
  const { Yai, Class, Faq } = store;

  /** The lowest price of each Yai's visible classes. */
  async function startingPrices(yaiIds) {
    const rows = await Class.aggregate([
      { $match: { yaiId: { $in: yaiIds }, isVisible: true } },
      { $group: { _id: "$yaiId", amount: { $min: "$price.amount" } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.amount]));
  }

  /** A Yai the viewer may see, or 404. */
  async function findYai(id, viewer) {
    const doc = isId(id) ? await Yai.findById(id).lean() : null;
    if (!doc || (!doc.isVisible && !isAdmin(viewer))) throw notFound();
    return doc;
  }

  /** A class and its Yai, if the viewer may see them, or 404. */
  async function findClass(id, viewer) {
    const doc = isId(id) ? await Class.findById(id).lean() : null;
    const yai = doc && (await Yai.findById(doc.yaiId).lean());
    if (!doc || !yai) throw notFound();
    if (!isAdmin(viewer) && !(doc.isVisible && yai.isVisible)) throw notFound();
    return { doc, yai };
  }

  async function yaiView(doc, viewer) {
    const classes = await Class.find({
      yaiId: doc._id,
      ...(!isAdmin(viewer) && { isVisible: true }),
    })
      .sort({ _id: 1 })
      .lean();
    const prices = await startingPrices([doc._id]);
    return views.yai(doc, {
      startingPrice: prices.get(doc._id.toString()),
      classes,
    });
  }

  return {
    async listYais(
      { q, region, featured, includeHidden, limit, cursor },
      viewer,
    ) {
      const showHidden = includeHidden && isAdmin(viewer);
      const conditions = [byId(cursor)];
      if (!showHidden) conditions.push({ isVisible: true });
      if (region) conditions.push({ region });
      if (featured !== undefined) conditions.push({ isFeatured: featured });
      if (q?.trim()) {
        const re = search(q);
        const cooks = await Class.distinct("yaiId", {
          $or: [{ dish: re }, { dishThai: re }],
          ...(!showHidden && { isVisible: true }),
        });
        conditions.push({
          $or: [
            { name: re },
            { nameThai: re },
            { story: re },
            { _id: { $in: cooks } },
          ],
        });
      }
      const { items, nextCursor } = await page(
        Yai.find({ $and: conditions }).sort({ _id: 1 }),
        limit,
      );
      const prices = await startingPrices(items.map((doc) => doc._id));
      return {
        items: items.map((doc) =>
          views.yaiSummary(doc, prices.get(doc._id.toString())),
        ),
        nextCursor,
      };
    },

    async getYai(id, viewer) {
      return yaiView(await findYai(id, viewer), viewer);
    },

    async createYai(input) {
      const doc = await Yai.create({
        name: input.name,
        nameThai: input.nameThai,
        region: input.region,
        story: input.story,
        photos: photosFrom(input.photoAssetIds, input.photoAlts),
        introVideoAssetId: input.introVideoAssetId,
        isSample: input.isSample,
        isVisible: input.isVisible ?? false,
        isFeatured: input.isFeatured ?? false,
        createdAt: now(),
      });
      return yaiView(doc.toObject(), { role: "admin" });
    },

    async updateYai(id, patch) {
      const doc = await findYai(id, { role: "admin" });
      const { photoAssetIds, photoAlts, ...fields } = patch;
      const set = { ...fields };
      if (photoAssetIds) set.photos = photosFrom(photoAssetIds, photoAlts);
      else if (photoAlts) {
        set.photos = photosFrom(
          doc.photos.map((p) => p.assetId),
          photoAlts,
        );
      }
      const updated = await Yai.findByIdAndUpdate(
        id,
        { $set: set },
        { returnDocument: "after", lean: true, runValidators: true },
      );
      if (!updated) throw notFound();
      return yaiView(updated, { role: "admin" });
    },

    async listClasses(
      { q, yaiId, region, maxPrice, featured, includeHidden, limit, cursor },
      viewer,
    ) {
      const showHidden = includeHidden && isAdmin(viewer);
      const conditions = [byId(cursor)];
      if (!showHidden) conditions.push({ isVisible: true });
      if (!showHidden || region) {
        const yaiIds = await Yai.distinct("_id", {
          ...(!showHidden && { isVisible: true }),
          ...(region && { region }),
        });
        conditions.push({ yaiId: { $in: yaiIds } });
      }
      if (yaiId) conditions.push({ yaiId });
      if (maxPrice !== undefined) {
        conditions.push({ "price.amount": { $lte: maxPrice } });
      }
      if (featured !== undefined) conditions.push({ isFeatured: featured });
      if (q?.trim()) {
        const re = search(q);
        conditions.push({
          $or: [{ dish: re }, { dishThai: re }, { description: re }],
        });
      }
      const { items, nextCursor } = await page(
        Class.find({ $and: conditions }).sort({ _id: 1 }),
        limit,
      );
      const yais = await Yai.find({
        _id: { $in: items.map((doc) => doc.yaiId) },
      }).lean();
      const yaiOf = new Map(yais.map((yai) => [yai._id.toString(), yai]));
      return {
        items: items.map((doc) =>
          views.classSummary(doc, yaiOf.get(doc.yaiId.toString())),
        ),
        nextCursor,
      };
    },

    async getClass(id, viewer) {
      const { doc, yai } = await findClass(id, viewer);
      return views.classDetail(doc, yai);
    },

    async createClass(input) {
      const yai = isId(input.yaiId)
        ? await Yai.findById(input.yaiId).lean()
        : null;
      if (!yai) {
        throw badRequest(undefined, [
          { field: "yaiId", message: "isn't a Yai" },
        ]);
      }
      const doc = await Class.create({
        yaiId: yai._id,
        dish: input.dish,
        dishThai: input.dishThai,
        description: input.description,
        price: input.price,
        durationMinutes: input.durationMinutes,
        maxGuests: input.maxGuests,
        photo: { assetId: input.photoAssetId, alt: input.photoAlt },
        previewClipAssetId: input.previewClipAssetId,
        isVisible: input.isVisible ?? false,
        isFeatured: input.isFeatured ?? false,
        createdAt: now(),
      });
      return views.classDetail(doc.toObject(), yai);
    },

    async updateClass(id, patch) {
      const { doc, yai } = await findClass(id, { role: "admin" });
      const { photoAssetId, photoAlt, ...set } = patch;
      if (photoAssetId || photoAlt !== undefined) {
        set.photo = {
          assetId: photoAssetId ?? doc.photo.assetId,
          alt: photoAlt ?? (photoAssetId ? undefined : doc.photo.alt),
        };
      }
      const updated = await Class.findByIdAndUpdate(
        id,
        { $set: set },
        { returnDocument: "after", lean: true, runValidators: true },
      );
      if (!updated) throw notFound();
      return views.classDetail(updated, yai);
    },

    async getRecipe(classId, viewer) {
      const { doc } = await findClass(classId, viewer);
      if (!doc.recipe) throw notFound("This class has no recipe yet.");
      return views.recipe(doc);
    },

    async putRecipe(classId, input) {
      await findClass(classId, { role: "admin" });
      const ids = input.ingredients.map((item) => item.id);
      const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
      if (repeated) {
        throw badRequest(undefined, [
          { field: "ingredients", message: `has "${repeated}" twice` },
        ]);
      }
      const updated = await Class.findByIdAndUpdate(
        classId,
        { $set: { recipe: input } },
        { returnDocument: "after", lean: true },
      );
      if (!updated) throw notFound();
      return views.recipe(updated);
    },

    async getFaq() {
      const doc = await Faq.findById("faq").lean();
      if (!doc) throw notFound("There is no FAQ yet.");
      return { groups: doc.groups };
    },

    async putFaq({ groups }) {
      const ids = groups.map((group) => group.id);
      const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
      if (repeated) {
        throw badRequest(undefined, [
          { field: "groups", message: `has "${repeated}" twice` },
        ]);
      }
      await Faq.replaceOne({ _id: "faq" }, { groups }, { upsert: true });
      return { groups };
    },
  };
}
