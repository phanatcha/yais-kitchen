import mongoose from "mongoose";

const { Schema } = mongoose;
const options = { versionKey: false };
// Parts of a document, with no IDs of their own.
const part = { _id: false, id: false };
const REGIONS = ["north", "northeast", "central", "east", "west", "south"];

// Photos and videos are media asset IDs. The files live in media.
const photoSchema = new Schema(
  { assetId: { type: String, required: true }, alt: String },
  part,
);

const yaiSchema = new Schema(
  {
    name: { type: String, required: true },
    nameThai: { type: String, required: true },
    region: { type: String, required: true, enum: REGIONS },
    story: { type: String, required: true },
    photos: { type: [photoSchema], required: true },
    introVideoAssetId: String,
    // Made-up example Yais. The one real Yai has this off.
    isSample: { type: Boolean, required: true },
    isVisible: { type: Boolean, required: true },
    isFeatured: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
  },
  options,
);
yaiSchema.index({ isVisible: 1, region: 1 });

const recipeSchema = new Schema(
  {
    ingredients: [
      new Schema(
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          nameThai: String,
          quantity: { type: String, required: true },
        },
        part,
      ),
    ],
    steps: [
      new Schema(
        { text: { type: String, required: true }, videoAssetId: String },
        part,
      ),
    ],
    yaiNote: String,
    yaiTip: String,
  },
  part,
);

const classSchema = new Schema(
  {
    yaiId: { type: Schema.Types.ObjectId, required: true, index: true },
    dish: { type: String, required: true },
    dishThai: { type: String, required: true },
    description: { type: String, required: true },
    // Satang, per person.
    price: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
    },
    durationMinutes: { type: Number, required: true },
    maxGuests: { type: Number, required: true },
    photo: { type: photoSchema, required: true },
    previewClipAssetId: String,
    recipe: recipeSchema,
    isVisible: { type: Boolean, required: true },
    isFeatured: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
  },
  options,
);

// When a Yai can teach, set by her family.
const availableTimeSchema = new Schema(
  {
    yaiId: { type: Schema.Types.ObjectId, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    // Set once Admin makes a class time from it. It stays set if that class
    // time is cancelled.
    classTimeId: { type: Schema.Types.ObjectId, default: null },
  },
  options,
);
availableTimeSchema.index({ yaiId: 1, startsAt: 1 });

const classTimeSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, required: true },
    yaiId: { type: Schema.Types.ObjectId, required: true },
    availableTimeId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    capacity: { type: Number, required: true },
    // An auth user ID. Catalog can't check it.
    helperId: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ["draft", "published", "cancelled"],
    },
  },
  options,
);
classTimeSchema.index({ startsAt: 1 });
classTimeSchema.index({ classId: 1, status: 1, startsAt: 1 });
classTimeSchema.index({ yaiId: 1, startsAt: 1 });
classTimeSchema.index({ helperId: 1, startsAt: 1 });

// One document, `_id: "faq"`.
const faqSchema = new Schema(
  {
    _id: String,
    groups: [
      new Schema(
        {
          id: { type: String, required: true },
          items: [
            new Schema(
              {
                question: { type: String, required: true },
                answer: { type: String, required: true },
              },
              part,
            ),
          ],
        },
        part,
      ),
    ],
  },
  options,
);

const applicationSchema = new Schema(
  {
    stage: {
      type: String,
      required: true,
      enum: [
        "received",
        "kitchen_visit",
        "trial_class",
        "approved",
        "declined",
      ],
    },
    yaiName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    region: { type: String, required: true, enum: REGIONS },
    dishes: { type: String, required: true },
    message: String,
    notes: String,
    createdAt: { type: Date, required: true },
  },
  options,
);
applicationSchema.index({ stage: 1, _id: -1 });

/**
 * Everything catalog keeps, in the `catalog` database.
 * @param {import("mongoose").Connection} connection
 */
export function createStore(connection) {
  const model = (name, schema, collection) =>
    connection.models[name] ?? connection.model(name, schema, collection);

  return {
    Yai: model("Yai", yaiSchema, "yais"),
    Class: model("Class", classSchema, "classes"),
    AvailableTime: model(
      "AvailableTime",
      availableTimeSchema,
      "available_times",
    ),
    ClassTime: model("ClassTime", classTimeSchema, "class_times"),
    Faq: model("Faq", faqSchema, "faq"),
    Application: model("Application", applicationSchema, "applications"),
    async init() {
      await Promise.all(
        Object.values(connection.models).map((m) => m.syncIndexes()),
      );
    },
  };
}
