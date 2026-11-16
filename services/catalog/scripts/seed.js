// Fills an empty catalog with made-up sample Yais, classes, recipes and an
// FAQ, so the Explore pages have something to show. Every Yai here has
// `isSample: true`; Admin adds the real Yai in the app.
//   npm run seed -w @yais-kitchen/catalog
// Photos are asset IDs that media's own seed fills from services/media/samples,
// so run that seed too. Running this again on a catalog made before the
// photos existed swaps the old placeholder for them.
import { loadConfig } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createStore } from "../src/store.js";

// The placeholder every sample used before media had sample photos.
const OLD_PHOTO = "6650a1f2c3d4e5f6a7b8c9a1";
const thb = (baht) => ({ amount: baht * 100, currency: "THB" });

const SAMPLES = [
  {
    yai: {
      name: "Yai Somsri",
      nameThai: "ยายสมศรี",
      region: "north",
      photo: {
        assetId: "6650a1f2c3d4e5f6a7b8c9b1",
        alt: "Yai Somsri smiling at home",
      },
      story:
        "Yai Somsri has cooked for her family in Chiang Mai for fifty years. Her khao soi is the one the neighbours ask for.",
      isFeatured: true,
    },
    classes: [
      {
        dish: "Khao Soi",
        photo: {
          assetId: "6650a1f2c3d4e5f6a7b8c9b4",
          alt: "A bowl of khao soi",
        },
        dishThai: "ข้าวซอย",
        description:
          "Curry noodle soup with crispy noodles on top, the way it is made in Chiang Mai.",
        price: thb(900),
        durationMinutes: 120,
        maxGuests: 4,
        isFeatured: true,
        recipe: {
          ingredients: [
            {
              id: "egg-noodles",
              name: "Fresh egg noodles",
              nameThai: "บะหมี่ไข่",
              quantity: "200 g",
            },
            {
              id: "chicken-thighs",
              name: "Chicken thighs",
              nameThai: "สะโพกไก่",
              quantity: "300 g",
            },
            {
              id: "coconut-milk",
              name: "Coconut milk",
              nameThai: "กะทิ",
              quantity: "400 ml",
            },
            {
              id: "curry-paste",
              name: "Khao soi curry paste",
              nameThai: "พริกแกงข้าวซอย",
              quantity: "3 tbsp",
            },
          ],
          steps: [
            {
              text: "Fry the curry paste in a little coconut milk until it smells sweet.",
            },
            {
              text: "Add the chicken and the rest of the coconut milk, then simmer for 20 minutes.",
            },
            {
              text: "Fry a handful of noodles until crisp for the top, and boil the rest.",
            },
          ],
          yaiTip: "Pickled mustard greens and a squeeze of lime finish it.",
        },
      },
      {
        dish: "Sai Ua",
        photo: {
          assetId: "6650a1f2c3d4e5f6a7b8c9b5",
          alt: "Sliced sai ua with fresh herbs",
        },
        dishThai: "ไส้อั่ว",
        description: "Northern sausage packed with lemongrass and herbs.",
        price: thb(800),
        durationMinutes: 90,
        maxGuests: 3,
      },
    ],
  },
  {
    yai: {
      name: "Yai Boonmee",
      nameThai: "ยายบุญมี",
      region: "northeast",
      photo: {
        assetId: "6650a1f2c3d4e5f6a7b8c9b2",
        alt: "Yai Boonmee in her garden apron",
      },
      story:
        "Yai Boonmee grows her own chillies in Khon Kaen and pounds every som tam by hand.",
    },
    classes: [
      {
        dish: "Som Tam",
        photo: {
          assetId: "6650a1f2c3d4e5f6a7b8c9b6",
          alt: "A plate of som tam",
        },
        dishThai: "ส้มตำ",
        description: "Green papaya salad, as hot as you can take it.",
        price: thb(800),
        durationMinutes: 60,
        maxGuests: 6,
      },
    ],
  },
  {
    yai: {
      name: "Yai Malee",
      nameThai: "ยายมาลี",
      region: "south",
      photo: {
        assetId: "6650a1f2c3d4e5f6a7b8c9b3",
        alt: "Yai Malee picking flowers in her garden",
      },
      story: "Yai Malee learned to cook from her mother in Songkhla.",
    },
    classes: [
      {
        dish: "Massaman Curry",
        photo: {
          assetId: "6650a1f2c3d4e5f6a7b8c9b7",
          alt: "A bowl of massaman curry",
        },
        dishThai: "แกงมัสมั่น",
        description: "A slow curry with potatoes and peanuts.",
        price: thb(1000),
        durationMinutes: 150,
        maxGuests: 4,
      },
    ],
  },
];

const FAQ = [
  {
    id: "booking",
    items: [
      {
        question: "Can I cancel my booking?",
        answer: "Yes, up to 48 hours before class, from My Classes.",
      },
    ],
  },
  {
    id: "before_class",
    items: [
      {
        question: "What do I need?",
        answer:
          "Your own kitchen, the ingredients on the shopping list, and a phone or laptop with a camera.",
      },
    ],
  },
];

const config = loadConfig({ MONGO_URL: { type: "url" } });
const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: "catalog",
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();

try {
  const store = createStore(connection);
  await store.init();
  if (await store.Yai.exists({})) {
    let swapped = 0;
    for (const { yai, classes } of SAMPLES) {
      const old = { isSample: true, "photos.assetId": OLD_PHOTO };
      const { modifiedCount } = await store.Yai.updateMany(
        { ...old, name: yai.name },
        { $set: { photos: [yai.photo] } },
      );
      swapped += modifiedCount;
      for (const { dish, photo } of classes) {
        const result = await store.Class.updateMany(
          { dish, "photo.assetId": OLD_PHOTO },
          { $set: { photo } },
        );
        swapped += result.modifiedCount;
      }
    }
    console.log(
      `The catalog already has Yais, so nothing was added. Gave ${swapped} samples their photos.`,
    );
  } else {
    const createdAt = new Date();
    for (const sample of SAMPLES) {
      const { photo, ...fields } = sample.yai;
      const yai = await store.Yai.create({
        photos: [photo],
        isSample: true,
        isVisible: true,
        isFeatured: false,
        createdAt,
        ...fields,
      });
      for (const fields of sample.classes) {
        await store.Class.create({
          yaiId: yai._id,
          isVisible: true,
          isFeatured: false,
          createdAt,
          ...fields,
        });
      }
    }
    if (!(await store.Faq.exists({ _id: "faq" }))) {
      await store.Faq.create({ _id: "faq", groups: FAQ });
    }
    console.log(
      `Added ${SAMPLES.length} sample Yais, their classes and an FAQ.`,
    );
  }
} finally {
  await connection.close();
}
