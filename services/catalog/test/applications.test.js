import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startCatalog, startDatabase } from "./helpers.js";

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

const APPLICATION = {
  yaiName: "Yai Malai",
  contactName: "Sam",
  email: "Family@Example.com",
  phone: "+66 81 234 5678",
  region: "south",
  dishes: "Massaman curry, khanom jeen",
  consent: true,
};
const submit = (body = APPLICATION) =>
  ctx.call("post", "/catalog/applications", null).send(body);
const move = (id, body) =>
  ctx.call("patch", `/catalog/applications/${id}`).send(body);

describe("applying to become a Yai", () => {
  it("saves the application and tells notification", async () => {
    const res = await submit();

    expect(res.status).toBe(201);
    expect(ctx.events.of("application.received").map((e) => e.data)).toEqual([
      {
        applicationId: res.body.id,
        yaiName: "Yai Malai",
        contactName: "Sam",
        email: "family@example.com",
      },
    ]);
    const [saved] = (await ctx.call("get", "/catalog/applications")).body.items;
    expect(saved).toMatchObject({ id: res.body.id, stage: "received" });
  });

  it("needs consent to keep the details", async () => {
    expect((await submit({ ...APPLICATION, consent: false })).status).toBe(400);
    const { consent, ...without } = APPLICATION;
    expect(consent).toBe(true);
    expect((await submit(without)).status).toBe(400);
  });

  it("keeps nothing when notification can't be told", async () => {
    ctx.events.down = true;
    expect((await submit()).status).toBe(503);
    expect(await db.store.Application.countDocuments()).toBe(0);
  });
});

describe("Admin's list of applications", () => {
  it("shows the newest first and filters by stage", async () => {
    const first = (await submit()).body.id;
    const second = (await submit({ ...APPLICATION, yaiName: "Yai Noi" })).body
      .id;
    await move(first, { stage: "kitchen_visit" });

    const all = await ctx.call("get", "/catalog/applications");
    expect(all.body.items.map((a) => a.id)).toEqual([second, first]);
    const visits = await ctx.call(
      "get",
      "/catalog/applications?stage=kitchen_visit",
    );
    expect(visits.body.items.map((a) => a.id)).toEqual([first]);

    const page = await ctx.call("get", "/catalog/applications?limit=1");
    const next = await ctx.call(
      "get",
      `/catalog/applications?limit=1&cursor=${page.body.nextCursor}`,
    );
    expect(next.body.items.map((a) => a.id)).toEqual([first]);
  });

  it("is for Admin only", async () => {
    for (const role of ["tourist", "family", "helper"]) {
      const auth = await ctx.as(role);
      expect(
        (await ctx.call("get", "/catalog/applications", auth)).status,
      ).toBe(403);
    }
  });
});

describe("moving an application along", () => {
  it("goes received, kitchen visit, trial class, approved", async () => {
    const id = (await submit()).body.id;
    for (const stage of ["kitchen_visit", "trial_class", "approved"]) {
      const res = await move(id, { stage });
      expect(res.status).toBe(200);
      expect(res.body.stage).toBe(stage);
    }
  });

  it("can be declined before the end, but never skips or goes back", async () => {
    const id = (await submit()).body.id;
    const skip = await move(id, { stage: "approved" });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("stage_not_allowed");

    await move(id, { stage: "kitchen_visit" });
    expect((await move(id, { stage: "received" })).status).toBe(409);
    expect((await move(id, { stage: "declined" })).body.stage).toBe("declined");
    expect((await move(id, { stage: "trial_class" })).status).toBe(409);
  });

  it("takes notes at any stage", async () => {
    const id = (await submit()).body.id;
    await move(id, { stage: "declined" });
    const res = await move(id, {
      notes: "Lives too far from a good connection.",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      stage: "declined",
      notes: "Lives too far from a good connection.",
    });
  });

  it("answers 404 for an application that doesn't exist", async () => {
    expect(
      (await move("6650a1f2c3d4e5f6a7b8ffff", { notes: "x" })).status,
    ).toBe(404);
  });
});
