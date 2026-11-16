// Turning Yais and classes into form values and back into API bodies.
import { PLACEHOLDER_PHOTO } from "./photos.js";

export const EMPTY_YAI = {
  name: "",
  nameThai: "",
  region: "",
  story: "",
  photoAssetId: PLACEHOLDER_PHOTO,
  photoAlt: "",
  isSample: false,
  isVisible: false,
  isFeatured: false,
};

/** A Yai from the API as form values. Only the first photo is edited. */
export function yaiToValues(yai) {
  return {
    name: yai.name,
    nameThai: yai.nameThai,
    region: yai.region,
    story: yai.story,
    photoAssetId: yai.photos?.[0]?.assetId ?? yai.photo.assetId,
    photoAlt: yai.photos?.[0]?.alt ?? yai.photo.alt ?? "",
    isSample: yai.isSample,
    isVisible: yai.isVisible,
    isFeatured: yai.isFeatured,
  };
}

/**
 * The body for POST /catalog/yais, or for PATCH with only what changed
 * when `before` is given. Her other photos stay as they were.
 */
export function yaiBody(values, before, yai) {
  const body = {
    name: values.name.trim(),
    nameThai: values.nameThai.trim(),
    region: values.region,
    story: values.story.trim(),
    isSample: values.isSample,
    isVisible: values.isVisible,
    isFeatured: values.isFeatured,
  };
  const rest = yai?.photos?.slice(1) ?? [];
  const photos = {
    photoAssetIds: [values.photoAssetId.trim(), ...rest.map((p) => p.assetId)],
    photoAlts: [values.photoAlt.trim(), ...rest.map((p) => p.alt ?? "")],
  };
  if (!before) return { ...body, ...photos };

  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== before[key]) patch[key] = value;
  }
  if (
    values.photoAssetId !== before.photoAssetId ||
    values.photoAlt !== before.photoAlt
  ) {
    Object.assign(patch, photos);
  }
  return patch;
}

export const EMPTY_CLASS = {
  dish: "",
  dishThai: "",
  description: "",
  priceBaht: "1000",
  durationMinutes: "90",
  maxGuests: "4",
  photoAssetId: PLACEHOLDER_PHOTO,
  photoAlt: "",
  isVisible: false,
  isFeatured: false,
};

/** A class from the API as form values; numbers stay strings for inputs. */
export function classToValues(c) {
  return {
    dish: c.dish,
    dishThai: c.dishThai,
    description: c.description,
    priceBaht: String(c.price.amount / 100),
    durationMinutes: String(c.durationMinutes),
    maxGuests: String(c.maxGuests),
    photoAssetId: c.photo.assetId,
    photoAlt: c.photo.alt ?? "",
    isVisible: c.isVisible,
    isFeatured: c.isFeatured,
  };
}

/** The body for POST /catalog/classes, or a PATCH of what changed. */
export function classBody(values, before) {
  const body = {
    dish: values.dish.trim(),
    dishThai: values.dishThai.trim(),
    description: values.description.trim(),
    price: {
      amount: Math.round(Number(values.priceBaht) * 100),
      currency: "THB",
    },
    durationMinutes: Number(values.durationMinutes),
    maxGuests: Number(values.maxGuests),
    photoAssetId: values.photoAssetId.trim(),
    photoAlt: values.photoAlt.trim(),
    isVisible: values.isVisible,
    isFeatured: values.isFeatured,
  };
  if (!before) return body;
  const old = classBody(before);
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (JSON.stringify(value) !== JSON.stringify(old[key])) patch[key] = value;
  }
  return patch;
}
