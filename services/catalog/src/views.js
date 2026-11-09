// Turns stored documents into the shapes in openapi.yaml.

/**
 * Links to photos and videos. Media stores ready files at fixed paths under
 * its public address, so catalog only keeps asset IDs.
 * @param {string} mediaPublicUrl
 */
export function createViews(mediaPublicUrl) {
  const base = mediaPublicUrl.replace(/\/+$/, "");
  const file = (assetId, name) => `${base}/${assetId}/${name}`;

  const photo = ({ assetId, alt }, fallbackAlt) => ({
    assetId,
    alt: alt || fallbackAlt,
    urls: {
      thumb: file(assetId, "thumb.webp"),
      card: file(assetId, "card.webp"),
      hero: file(assetId, "hero.webp"),
    },
  });
  const video = (assetId) =>
    assetId && {
      assetId,
      url: file(assetId, "video.mp4"),
      posterUrl: file(assetId, "poster.webp"),
    };
  const money = (amount) => ({ amount, currency: "THB" });
  const iso = (date) => date.toISOString();

  const classSummary = (doc, yai) => ({
    id: doc._id.toString(),
    yaiId: doc.yaiId.toString(),
    yaiName: yai.name,
    dish: doc.dish,
    dishThai: doc.dishThai,
    price: money(doc.price.amount),
    durationMinutes: doc.durationMinutes,
    photo: photo(doc.photo, doc.dish),
    isSample: yai.isSample,
  });

  const yaiSummary = (doc, startingPrice = 0) => ({
    id: doc._id.toString(),
    name: doc.name,
    nameThai: doc.nameThai,
    region: doc.region,
    photo: photo(doc.photos[0], doc.name),
    startingPrice: money(startingPrice),
    isSample: doc.isSample,
  });

  return {
    yaiSummary,
    classSummary,

    yai: (doc, { startingPrice, classes }) => ({
      ...yaiSummary(doc, startingPrice),
      story: doc.story,
      photos: doc.photos.map((p) => photo(p, doc.name)),
      ...(doc.introVideoAssetId && {
        introVideo: video(doc.introVideoAssetId),
      }),
      classes: classes.map((c) => classSummary(c, doc)),
      isVisible: doc.isVisible,
      isFeatured: doc.isFeatured,
    }),

    classDetail: (doc, yai) => ({
      ...classSummary(doc, yai),
      description: doc.description,
      maxGuests: doc.maxGuests,
      needsOwnKitchen: true,
      ...(doc.previewClipAssetId && {
        previewClip: video(doc.previewClipAssetId),
      }),
      isVisible: doc.isVisible,
      isFeatured: doc.isFeatured,
    }),

    recipe: (doc) => ({
      classId: doc._id.toString(),
      dish: doc.dish,
      dishThai: doc.dishThai,
      ingredients: doc.recipe.ingredients.map(ingredient),
      steps: doc.recipe.steps.map(({ text, videoAssetId }) => ({
        text,
        ...(videoAssetId && { video: video(videoAssetId) }),
      })),
      ...(doc.recipe.yaiNote && { yaiNote: doc.recipe.yaiNote }),
      ...(doc.recipe.yaiTip && { yaiTip: doc.recipe.yaiTip }),
    }),

    ingredient,

    availableTime: (doc) => ({
      id: doc._id.toString(),
      yaiId: doc.yaiId.toString(),
      startsAt: iso(doc.startsAt),
      endsAt: iso(doc.endsAt),
      isUsed: doc.classTimeId !== null,
    }),

    classTime: (doc) => ({
      id: doc._id.toString(),
      classId: doc.classId.toString(),
      yaiId: doc.yaiId.toString(),
      startsAt: iso(doc.startsAt),
      endsAt: iso(doc.endsAt),
      capacity: doc.capacity,
      helperId: doc.helperId,
      status: doc.status,
    }),

    application: (doc) => ({
      id: doc._id.toString(),
      stage: doc.stage,
      yaiName: doc.yaiName,
      contactName: doc.contactName,
      email: doc.email,
      phone: doc.phone,
      region: doc.region,
      dishes: doc.dishes,
      ...(doc.message && { message: doc.message }),
      ...(doc.notes && { notes: doc.notes }),
      createdAt: iso(doc.createdAt),
    }),
  };
}

function ingredient({ id, name, nameThai, quantity }) {
  return { id, name, ...(nameThai && { nameThai }), quantity };
}
