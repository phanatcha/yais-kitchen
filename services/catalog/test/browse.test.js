import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ASSET, MEDIA, startCatalog, startDatabase } from "./helpers.js";

let db;
let ctx;
beforeAll(async () => {
  db = await startDatabase();
});
afterAll(() => db?.stop());
beforeEach(async () => {
  await db.clear();
  ctx = await startCatalog(db.store);
});

const get = (path, auth) => ctx.call("get", path, auth ?? null);
const names = (res) => res.body.items.map((item) => item.name ?? item.dish);

describe("browsing Yais", () => {
  it("shows visible Yais to everyone, each with isSample and a starting price", async () => {
    const somsri = await ctx.makeYai();
    await ctx.makeClass(somsri.id, {
      price: { amount: 90000, currency: "THB" },
    });
    await ctx.makeClass(somsri.id, {
      dish: "Sai Ua",
      price: { amount: 70000, currency: "THB" },
    });
    await ctx.makeClass(somsri.id, {
      dish: "Hidden dish",
      price: { amount: 10000, currency: "THB" },
      isVisible: false,
    });
    await ctx.makeYai({ name: "Yai Real", isSample: false });
    await ctx.makeYai({ name: "Yai Hidden", isVisible: false });

    const res = await get("/catalog/yais");

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(["Yai Somsri", "Yai Real"]);
    expect(res.body.items[0]).toMatchObject({
      isSample: true,
      startingPrice: { amount: 70000, currency: "THB" },
      photo: {
        assetId: ASSET,
        alt: "Yai Somsri",
        urls: {
          thumb: `${MEDIA}/${ASSET}/thumb.webp`,
          card: `${MEDIA}/${ASSET}/card.webp`,
          hero: `${MEDIA}/${ASSET}/hero.webp`,
        },
      },
    });
    expect(res.body.items[1]).toMatchObject({
      isSample: false,
      startingPrice: { amount: 0, currency: "THB" },
    });
  });

  it("shows hidden Yais only to Admin, and only when asked", async () => {
    await ctx.makeYai();
    await ctx.makeYai({ name: "Yai Hidden", isVisible: false });
    const tourist = await ctx.as("tourist");

    expect(names(await get("/catalog/yais?includeHidden=true"))).toEqual([
      "Yai Somsri",
    ]);
    expect(
      names(await get("/catalog/yais?includeHidden=true", tourist)),
    ).toEqual(["Yai Somsri"]);
    expect(names(await get("/catalog/yais", ctx.admin))).toEqual([
      "Yai Somsri",
    ]);
    expect(
      names(await get("/catalog/yais?includeHidden=true", ctx.admin)),
    ).toEqual(["Yai Somsri", "Yai Hidden"]);
  });

  it("searches names, story and the dishes she teaches", async () => {
    const somsri = await ctx.makeYai();
    await ctx.makeClass(somsri.id);
    const boonmee = await ctx.makeYai({
      name: "Yai Boonmee",
      nameThai: "ยายบุญมี",
      region: "northeast",
      story: "She grows her own chillies.",
    });
    await ctx.makeClass(boonmee.id, { dish: "Som Tam", dishThai: "ส้มตำ" });

    expect(names(await get("/catalog/yais?q=khao%20soi"))).toEqual([
      "Yai Somsri",
    ]);
    expect(names(await get("/catalog/yais?q=CHILLIES"))).toEqual([
      "Yai Boonmee",
    ]);
    expect(
      names(await get(`/catalog/yais?q=${encodeURIComponent("ส้มตำ")}`)),
    ).toEqual(["Yai Boonmee"]);
    expect(names(await get("/catalog/yais?q=boon"))).toEqual(["Yai Boonmee"]);
    expect(names(await get("/catalog/yais?q=.%2A"))).toEqual([]);
  });

  it("doesn't find a Yai by a dish of a hidden class", async () => {
    const somsri = await ctx.makeYai();
    await ctx.makeClass(somsri.id, { dish: "Secret curry", isVisible: false });
    expect(names(await get("/catalog/yais?q=secret"))).toEqual([]);
  });

  it("filters by region and featured", async () => {
    await ctx.makeYai({ isFeatured: true });
    await ctx.makeYai({ name: "Yai Malee", region: "south" });

    expect(names(await get("/catalog/yais?region=south"))).toEqual([
      "Yai Malee",
    ]);
    expect(names(await get("/catalog/yais?featured=true"))).toEqual([
      "Yai Somsri",
    ]);
    expect(names(await get("/catalog/yais?featured=false"))).toEqual([
      "Yai Malee",
    ]);
    expect((await get("/catalog/yais?region=mars")).status).toBe(400);
  });

  it("pages through Yais", async () => {
    for (let i = 1; i <= 5; i += 1) await ctx.makeYai({ name: `Yai ${i}` });

    const first = await get("/catalog/yais?limit=2");
    const second = await get(
      `/catalog/yais?limit=2&cursor=${first.body.nextCursor}`,
    );
    const third = await get(
      `/catalog/yais?limit=2&cursor=${second.body.nextCursor}`,
    );

    expect([...names(first), ...names(second), ...names(third)]).toEqual([
      "Yai 1",
      "Yai 2",
      "Yai 3",
      "Yai 4",
      "Yai 5",
    ]);
    expect(third.body.nextCursor).toBeNull();
    expect((await get("/catalog/yais?cursor=nope")).status).toBe(400);
  });

  it("shows a Yai's profile with her visible classes", async () => {
    const somsri = await ctx.makeYai({
      introVideoAssetId: ASSET,
      photoAlts: ["At the stove"],
    });
    await ctx.makeClass(somsri.id);
    await ctx.makeClass(somsri.id, { dish: "Draft dish", isVisible: false });

    const res = await get(`/catalog/yais/${somsri.id}`);

    expect(res.status).toBe(200);
    expect(res.body.photos[0].alt).toBe("At the stove");
    expect(res.body.introVideo).toEqual({
      assetId: ASSET,
      url: `${MEDIA}/${ASSET}/video.mp4`,
      posterUrl: `${MEDIA}/${ASSET}/poster.webp`,
    });
    expect(res.body.classes.map((c) => c.dish)).toEqual(["Khao Soi"]);
    const forAdmin = await get(`/catalog/yais/${somsri.id}`, ctx.admin);
    expect(forAdmin.body.classes).toHaveLength(2);
  });

  it("answers 404 for a hidden Yai, except to Admin", async () => {
    const hidden = await ctx.makeYai({ isVisible: false });

    expect((await get(`/catalog/yais/${hidden.id}`)).status).toBe(404);
    expect(
      (await get(`/catalog/yais/${hidden.id}`, await ctx.as("family"))).status,
    ).toBe(404);
    expect((await get(`/catalog/yais/${hidden.id}`, ctx.admin)).status).toBe(
      200,
    );
    expect((await get("/catalog/yais/6650a1f2c3d4e5f6a7b8ffff")).status).toBe(
      404,
    );
  });
});

describe("browsing classes", () => {
  let somsri;
  let malee;
  beforeEach(async () => {
    somsri = await ctx.makeYai();
    malee = await ctx.makeYai({
      name: "Yai Malee",
      region: "south",
      isSample: false,
    });
    await ctx.makeClass(somsri.id);
    await ctx.makeClass(malee.id, {
      dish: "Massaman Curry",
      dishThai: "แกงมัสมั่น",
      description: "A slow curry with potatoes and peanuts.",
      price: { amount: 120000, currency: "THB" },
      isFeatured: true,
    });
  });

  it("shows visible classes with their Yai's name and sample flag", async () => {
    await ctx.makeClass(somsri.id, { dish: "Hidden", isVisible: false });
    const res = await get("/catalog/classes");

    expect(names(res)).toEqual(["Khao Soi", "Massaman Curry"]);
    expect(res.body.items[1]).toMatchObject({
      yaiId: malee.id,
      yaiName: "Yai Malee",
      isSample: false,
      durationMinutes: 120,
    });
  });

  it("hides the classes of a hidden Yai", async () => {
    await ctx
      .call("patch", `/catalog/yais/${malee.id}`)
      .send({ isVisible: false });
    expect(names(await get("/catalog/classes"))).toEqual(["Khao Soi"]);
    expect(
      names(await get("/catalog/classes?includeHidden=true", ctx.admin)),
    ).toEqual(["Khao Soi", "Massaman Curry"]);
  });

  it("filters by Yai, region, price and featured, and searches dishes", async () => {
    expect(names(await get(`/catalog/classes?yaiId=${malee.id}`))).toEqual([
      "Massaman Curry",
    ]);
    expect(names(await get("/catalog/classes?region=north"))).toEqual([
      "Khao Soi",
    ]);
    expect(names(await get("/catalog/classes?maxPrice=90000"))).toEqual([
      "Khao Soi",
    ]);
    expect(names(await get("/catalog/classes?maxPrice=89999"))).toEqual([]);
    expect(names(await get("/catalog/classes?featured=true"))).toEqual([
      "Massaman Curry",
    ]);
    expect(names(await get("/catalog/classes?q=peanut"))).toEqual([
      "Massaman Curry",
    ]);
    expect(
      names(await get(`/catalog/classes?q=${encodeURIComponent("ข้าว")}`)),
    ).toEqual(["Khao Soi"]);
    expect(names(await get("/catalog/classes?region=south&q=khao"))).toEqual(
      [],
    );
    expect((await get("/catalog/classes?maxPrice=-1")).status).toBe(400);
  });

  it("shows class detail, and says the tourist needs their own kitchen", async () => {
    const { items } = (await get("/catalog/classes")).body;
    const res = await get(`/catalog/classes/${items[0].id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ maxGuests: 4, needsOwnKitchen: true });
  });

  it("answers 404 for a hidden class, except to Admin", async () => {
    const hidden = await ctx.makeClass(somsri.id, { isVisible: false });
    expect((await get(`/catalog/classes/${hidden.id}`)).status).toBe(404);
    expect((await get(`/catalog/classes/${hidden.id}`, ctx.admin)).status).toBe(
      200,
    );
  });
});

describe("recipes", () => {
  const RECIPE = {
    ingredients: [
      {
        id: "egg-noodles",
        name: "Fresh egg noodles",
        nameThai: "บะหมี่ไข่",
        quantity: "200 g",
      },
      { id: "coconut-milk", name: "Coconut milk", quantity: "400 ml" },
    ],
    steps: [
      { text: "Fry the curry paste." },
      { text: "Add the milk.", videoAssetId: ASSET },
    ],
    yaiTip: "Don't let it boil.",
  };

  it("has none until Admin writes it, then shows the card", async () => {
    const somsri = await ctx.makeYai();
    const khaoSoi = await ctx.makeClass(somsri.id);
    const path = `/catalog/classes/${khaoSoi.id}/recipe`;

    expect((await get(path)).status).toBe(404);
    const put = await ctx.call("put", path).send(RECIPE);
    expect(put.status).toBe(200);

    const res = await get(path);
    expect(res.body).toMatchObject({
      classId: khaoSoi.id,
      dishThai: "ข้าวซอย",
      ingredients: RECIPE.ingredients,
      yaiTip: "Don't let it boil.",
    });
    expect(res.body.steps[1].video.url).toBe(`${MEDIA}/${ASSET}/video.mp4`);
  });

  it("refuses the same ingredient twice", async () => {
    const somsri = await ctx.makeYai();
    const khaoSoi = await ctx.makeClass(somsri.id);
    const res = await ctx
      .call("put", `/catalog/classes/${khaoSoi.id}/recipe`)
      .send({
        ...RECIPE,
        ingredients: [RECIPE.ingredients[0], RECIPE.ingredients[0]],
      });
    expect(res.status).toBe(400);
  });
});

describe("FAQ", () => {
  it("is empty until Admin writes it", async () => {
    expect((await get("/catalog/faq")).status).toBe(404);
    const faq = {
      groups: [
        {
          id: "booking",
          items: [
            { question: "Can I cancel?", answer: "Up to 48 hours before." },
          ],
        },
      ],
    };
    expect((await ctx.call("put", "/catalog/faq").send(faq)).status).toBe(200);
    expect((await get("/catalog/faq")).body).toEqual(faq);
  });

  it("refuses the same group twice", async () => {
    const group = { id: "booking", items: [] };
    const res = await ctx
      .call("put", "/catalog/faq")
      .send({ groups: [group, group] });
    expect(res.status).toBe(400);
  });
});

describe("who can change the catalog", () => {
  it("lets only Admin add and edit Yais, classes, recipes and the FAQ", async () => {
    const somsri = await ctx.makeYai();
    const khaoSoi = await ctx.makeClass(somsri.id);
    // Valid bodies, so only the role decides.
    const changes = [
      [
        "post",
        "/catalog/yais",
        {
          name: "X",
          nameThai: "X",
          region: "north",
          story: "X",
          photoAssetIds: [ASSET],
          isSample: true,
        },
      ],
      ["patch", `/catalog/yais/${somsri.id}`, { isVisible: false }],
      [
        "post",
        "/catalog/classes",
        {
          yaiId: somsri.id,
          dish: "X",
          dishThai: "X",
          description: "X",
          price: { amount: 1, currency: "THB" },
          durationMinutes: 60,
          maxGuests: 2,
          photoAssetId: ASSET,
        },
      ],
      ["patch", `/catalog/classes/${khaoSoi.id}`, { isVisible: false }],
      [
        "put",
        `/catalog/classes/${khaoSoi.id}/recipe`,
        {
          ingredients: [{ id: "rice", name: "Rice", quantity: "1 cup" }],
          steps: [{ text: "Cook it." }],
        },
      ],
      ["put", "/catalog/faq", { groups: [] }],
    ];
    const people = [
      await ctx.as("tourist"),
      await ctx.as("family", { yaiId: somsri.id }),
      await ctx.as("helper"),
      await ctx.as("guest", { sid: "6b1f8a7e-6f43-4b8e-9d55-0a1d3c2b9e10" }),
    ];

    for (const [method, path, body] of changes) {
      expect((await ctx.call(method, path, null).send(body)).status).toBe(401);
      for (const person of people) {
        expect((await ctx.call(method, path, person).send(body)).status).toBe(
          403,
        );
      }
    }
    expect((await get(`/catalog/yais/${somsri.id}`)).body.isVisible).toBe(true);
  });

  it("lets Admin hide and show a Yai", async () => {
    const somsri = await ctx.makeYai();
    const hide = await ctx
      .call("patch", `/catalog/yais/${somsri.id}`)
      .send({ isVisible: false });

    expect(hide.status).toBe(200);
    expect(hide.body.isVisible).toBe(false);
    expect((await get(`/catalog/yais/${somsri.id}`)).status).toBe(404);
    await ctx
      .call("patch", `/catalog/yais/${somsri.id}`)
      .send({ isVisible: true });
    expect((await get(`/catalog/yais/${somsri.id}`)).status).toBe(200);
  });

  it("keeps photo descriptions in step with the photos", async () => {
    const somsri = await ctx.makeYai({
      photoAssetIds: [ASSET, "6650a1f2c3d4e5f6a7b8c9a2"],
    });
    const res = await ctx
      .call("patch", `/catalog/yais/${somsri.id}`)
      .send({ photoAlts: ["Smiling", "Cooking"] });
    expect(res.body.photos.map((p) => p.alt)).toEqual(["Smiling", "Cooking"]);

    const tooMany = await ctx
      .call("patch", `/catalog/yais/${somsri.id}`)
      .send({ photoAlts: ["a", "b", "c"] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.details[0].field).toBe("photoAlts");
  });

  it("edits a class's price and photo", async () => {
    const somsri = await ctx.makeYai();
    const khaoSoi = await ctx.makeClass(somsri.id, { photoAlt: "A bowl" });
    const res = await ctx.call("patch", `/catalog/classes/${khaoSoi.id}`).send({
      price: { amount: 95000, currency: "THB" },
      photoAlt: "A steaming bowl",
    });

    expect(res.status).toBe(200);
    expect(res.body.price.amount).toBe(95000);
    expect(res.body.photo).toMatchObject({
      assetId: ASSET,
      alt: "A steaming bowl",
    });
  });

  it("won't add a class for a Yai that doesn't exist", async () => {
    const res = await ctx.call("post", "/catalog/classes").send({
      yaiId: "6650a1f2c3d4e5f6a7b8ffff",
      dish: "X",
      dishThai: "X",
      description: "X",
      price: { amount: 1, currency: "THB" },
      durationMinutes: 60,
      maxGuests: 2,
      photoAssetId: ASSET,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("yaiId");
  });

  it("needs isSample on every new Yai", async () => {
    const res = await ctx.call("post", "/catalog/yais").send({
      name: "Yai Somsri",
      nameThai: "ยายสมศรี",
      region: "north",
      story: "Story",
      photoAssetIds: [ASSET],
    });
    expect(res.status).toBe(400);
  });
});
