// Fills an empty catalog with made-up sample Yais, classes, recipes and an
// FAQ, so the Explore pages have something to show. Every Yai here has
// `isSample: true`; Admin adds the real Yai in the app.
//   npm run seed -w @yais-kitchen/catalog
// Photos point at placeholder asset IDs, so images stay blank until media
// has files for them.
import { loadConfig } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createStore } from "../src/store.js";

const PHOTO = "6650a1f2c3d4e5f6a7b8c9a1";
const thb = (baht) => ({ amount: baht * 100, currency: "THB" });

const SAMPLES = [
  {
    yai: {
      name: "Yai Somsri",
      nameThai: "ยายสมศรี",
      region: "north",
      story:
        "Yai Somsri has cooked for her family in Chiang Mai for fifty years. Her khao soi is the one the neighbours ask for.",
      isFeatured: true,
    },
    classes: [
      {
        dish: "Khao Soi",
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
      story:
        "Yai Boonmee grows her own chillies in Khon Kaen and pounds every som tam by hand.",
    },
    classes: [
      {
        dish: "Som Tam",
        dishThai: "ส้มตำ",
        description: "Green papaya salad, as hot as you can take it.",
        price: thb(700),
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
      story: "Yai Malee learned to cook from her mother in Songkhla.",
    },
    classes: [
      {
        dish: "Massaman Curry",
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
    console.log("The catalog already has Yais, so nothing was added.");
  } else {
    const createdAt = new Date();
    for (const sample of SAMPLES) {
      const yai = await store.Yai.create({
        photos: [{ assetId: PHOTO }],
        isSample: true,
        isVisible: true,
        isFeatured: false,
        createdAt,
        ...sample.yai,
      });
      for (const fields of sample.classes) {
        await store.Class.create({
          yaiId: yai._id,
          photo: { assetId: PHOTO },
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
