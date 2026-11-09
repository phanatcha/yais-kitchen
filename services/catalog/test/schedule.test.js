import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HOUR,
  INTERNAL_TOKEN,
  startCatalog,
  startDatabase,
} from "./helpers.js";

let db;
let ctx;
let somsri;
let khaoSoi;
let family;

beforeAll(async () => {
  db = await startDatabase();
});
afterAll(() => db?.stop());
beforeEach(async () => {
  await db.clear();
  ctx = await startCatalog(db.store);
  somsri = await ctx.makeYai();
  khaoSoi = await ctx.makeClass(somsri.id, {
    durationMinutes: 120,
    maxGuests: 4,
  });
  family = await ctx.as("family", { yaiId: somsri.id });
});

/** An ISO time this many hours from the test's now. */
const inHours = (hours) =>
  new Date(ctx.clock.time + hours * HOUR).toISOString();
// Query values are URL encoded, the way a browser sends them.
const q = encodeURIComponent;
const timesPath = (yaiId = somsri.id) =>
  `/catalog/yais/${yaiId}/available-times`;

async function addTime(
  startHours = 48,
  endHours = startHours + 3,
  auth = family,
) {
  const res = await ctx
    .call("post", timesPath(), auth)
    .send({ startsAt: inHours(startHours), endsAt: inHours(endHours) });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body;
}

const makeClassTime = (body) =>
  ctx.call("post", "/catalog/class-times").send(body);
const internal = (path, token = INTERNAL_TOKEN) =>
  ctx.call("get", path, null).set("x-internal-token", token);

describe("available times", () => {
  it("lets a family add and list their own Yai's times", async () => {
    const later = await addTime(72);
    const sooner = await addTime(24);

    expect(sooner).toMatchObject({ yaiId: somsri.id, isUsed: false });
    const list = await ctx.call("get", timesPath(), family);
    expect(list.status).toBe(200);
    expect(list.body.items.map((t) => t.id)).toEqual([sooner.id, later.id]);
  });

  it("keeps a family away from another Yai's times", async () => {
    const malee = await ctx.makeYai({ name: "Yai Malee" });
    const body = { startsAt: inHours(24), endsAt: inHours(26) };

    expect((await ctx.call("get", timesPath(malee.id), family)).status).toBe(
      403,
    );
    expect(
      (await ctx.call("post", timesPath(malee.id), family).send(body)).status,
    ).toBe(403);
    expect(
      (await ctx.call("post", timesPath(malee.id)).send(body)).status,
    ).toBe(201);
  });

  it("is only for families and Admin", async () => {
    const body = { startsAt: inHours(24), endsAt: inHours(26) };
    for (const role of ["tourist", "helper"]) {
      const auth = await ctx.as(role);
      expect(
        (await ctx.call("post", timesPath(), auth).send(body)).status,
      ).toBe(403);
    }
    expect((await ctx.call("post", timesPath(), null).send(body)).status).toBe(
      401,
    );
  });

  it("refuses times in the past, backwards, too long or overlapping", async () => {
    const add = (startHours, endHours) =>
      ctx
        .call("post", timesPath(), family)
        .send({ startsAt: inHours(startHours), endsAt: inHours(endHours) });

    expect((await add(-1, 2)).body.error.details[0].field).toBe("startsAt");
    expect((await add(5, 4)).body.error.details[0].field).toBe("endsAt");
    expect((await add(5, 14)).status).toBe(400);
    await addTime(24, 27);
    const overlap = await add(26, 28);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe("time_overlaps");
    expect((await add(27, 29)).status).toBe(201);
  });

  it("answers 404 when Admin adds a time for a Yai that doesn't exist", async () => {
    const res = await ctx
      .call("post", timesPath("6650a1f2c3d4e5f6a7b8ffff"))
      .send({ startsAt: inHours(24), endsAt: inHours(26) });
    expect(res.status).toBe(404);
  });

  it("removes a time until Admin has made a class time from it", async () => {
    const free = await addTime(24);
    const used = await addTime(48);
    await makeClassTime({ classId: khaoSoi.id, availableTimeId: used.id });

    expect(
      (await ctx.call("delete", `${timesPath()}/${free.id}`, family)).status,
    ).toBe(204);
    const blocked = await ctx.call(
      "delete",
      `${timesPath()}/${used.id}`,
      family,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("time_in_use");
    expect(
      (await ctx.call("delete", `${timesPath()}/${free.id}`, family)).status,
    ).toBe(404);
  });

  it("pages by start time", async () => {
    for (let day = 1; day <= 3; day += 1) await addTime(day * 24);
    const first = await ctx.call("get", `${timesPath()}?limit=2`, family);
    const second = await ctx.call(
      "get",
      `${timesPath()}?limit=2&cursor=${first.body.nextCursor}`,
      family,
    );

    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(
      (await ctx.call("get", `${timesPath()}?cursor=bad`, family)).status,
    ).toBe(400);
  });
});

describe("class times", () => {
  it("stays a draft without a helper, and can't be booked until it has one", async () => {
    const time = await addTime(48);
    const draft = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: time.id,
    });

    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({
      classId: khaoSoi.id,
      yaiId: somsri.id,
      startsAt: time.startsAt,
      endsAt: inHours(50),
      capacity: 4,
      helperId: null,
      status: "draft",
    });
    const bookable = () =>
      internal(`/internal/catalog/class-times?classId=${khaoSoi.id}`);
    expect((await bookable()).body.items).toEqual([]);

    const helperId = "6650a1f2c3d4e5f6a7b8c9b1";
    const assigned = await ctx
      .call("patch", `/catalog/class-times/${draft.body.id}`)
      .send({ helperId });
    expect(assigned.body).toMatchObject({ helperId, status: "published" });
    expect((await bookable()).body.items.map((t) => t.id)).toEqual([
      draft.body.id,
    ]);

    const times = await ctx.call("get", `${timesPath()}`, family);
    expect(times.body.items[0].isUsed).toBe(true);
  });

  it("is published straight away when it has a helper", async () => {
    const time = await addTime(48);
    const res = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: time.id,
      helperId: "6650a1f2c3d4e5f6a7b8c9b1",
    });
    expect(res.body.status).toBe("published");
  });

  it("makes one class time from each available time", async () => {
    const time = await addTime(48);
    const body = { classId: khaoSoi.id, availableTimeId: time.id };
    const answers = await Promise.all([
      makeClassTime(body),
      makeClassTime(body),
    ]);

    expect(answers.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(answers.find((res) => res.status === 409).body.error.code).toBe(
      "time_in_use",
    );
  });

  it("needs a time long enough, in the future, of the class's own Yai", async () => {
    const short = await addTime(48, 49);
    const tooShort = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: short.id,
    });
    expect(tooShort.status).toBe(409);
    expect(tooShort.body.error.code).toBe("time_too_short");

    const soon = await addTime(2);
    ctx.clock.time += 3 * HOUR;
    const passed = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: soon.id,
    });
    expect(passed.body.error.code).toBe("time_passed");

    const malee = await ctx.makeYai({ name: "Yai Malee" });
    const maleeTime = await ctx
      .call("post", timesPath(malee.id))
      .send({ startsAt: inHours(48), endsAt: inHours(52) });
    const wrongYai = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: maleeTime.body.id,
    });
    expect(wrongYai.status).toBe(400);
    expect(wrongYai.body.error.details[0].field).toBe("availableTimeId");

    const noClass = await makeClassTime({
      classId: "6650a1f2c3d4e5f6a7b8ffff",
      availableTimeId: short.id,
    });
    expect(noClass.body.error.details[0].field).toBe("classId");
  });

  it("is made only by Admin", async () => {
    const time = await addTime(48);
    const body = { classId: khaoSoi.id, availableTimeId: time.id };
    for (const auth of [
      family,
      await ctx.as("helper"),
      await ctx.as("tourist"),
    ]) {
      expect(
        (await ctx.call("post", "/catalog/class-times", auth).send(body))
          .status,
      ).toBe(403);
    }
  });

  it("shows Admin every time, a helper their own, and a family their Yai's", async () => {
    const helper = "6650a1f2c3d4e5f6a7b8c9b1";
    const mine = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: (await addTime(24)).id,
      helperId: helper,
    });
    await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: (await addTime(48)).id,
    });
    const malee = await ctx.makeYai({ name: "Yai Malee" });
    const curry = await ctx.makeClass(malee.id, { dish: "Massaman Curry" });
    const maleeTime = await ctx
      .call("post", timesPath(malee.id))
      .send({ startsAt: inHours(30), endsAt: inHours(33) });
    await makeClassTime({
      classId: curry.id,
      availableTimeId: maleeTime.body.id,
    });

    const list = async (auth, query = "") =>
      (await ctx.call("get", `/catalog/class-times${query}`, auth)).body.items;

    expect(await list(ctx.admin)).toHaveLength(3);
    expect((await list(ctx.admin, "?status=draft")).length).toBe(2);
    expect(
      (await list(await ctx.as("helper", { sub: helper }))).map((t) => t.id),
    ).toEqual([mine.body.id]);
    const familyTimes = await list(family);
    expect(familyTimes.every((t) => t.yaiId === somsri.id)).toBe(true);
    expect(familyTimes).toHaveLength(2);
    const other = await ctx.call(
      "get",
      `/catalog/class-times?yaiId=${malee.id}`,
      family,
    );
    expect(other.status).toBe(403);
    expect(
      (await ctx.call("get", "/catalog/class-times", await ctx.as("tourist")))
        .status,
    ).toBe(403);
  });

  it("hides past class times unless asked from an earlier time", async () => {
    await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: (await addTime(5)).id,
    });
    ctx.clock.time += 24 * HOUR;
    const from = new Date(ctx.clock.time - 48 * HOUR).toISOString();

    expect(
      (await ctx.call("get", "/catalog/class-times")).body.items,
    ).toHaveLength(0);
    const res = await ctx.call("get", `/catalog/class-times?from=${q(from)}`);
    expect(res.body.items).toHaveLength(1);
  });
});

describe("cancelling a class time", () => {
  let classTime;
  beforeEach(async () => {
    const time = await addTime(48);
    classTime = (
      await makeClassTime({
        classId: khaoSoi.id,
        availableTimeId: time.id,
        helperId: "6650a1f2c3d4e5f6a7b8c9b1",
      })
    ).body;
  });
  const patch = (body) =>
    ctx.call("patch", `/catalog/class-times/${classTime.id}`).send(body);

  it("tells booking, which refunds everyone, and stops it being bookable", async () => {
    const res = await patch({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(ctx.events.of("class_time.cancelled").map((e) => e.data)).toEqual([
      {
        classTimeId: classTime.id,
        classId: khaoSoi.id,
        yaiId: somsri.id,
        startsAt: classTime.startsAt,
      },
    ]);
    const bookable = await internal(
      `/internal/catalog/class-times?classId=${khaoSoi.id}`,
    );
    expect(bookable.body.items).toEqual([]);
  });

  it("does nothing more when cancelled again", async () => {
    await patch({ status: "cancelled" });
    const again = await patch({ status: "cancelled" });

    expect(again.status).toBe(200);
    expect(ctx.events.of("class_time.cancelled")).toHaveLength(1);
  });

  it("can't take a helper once cancelled", async () => {
    await patch({ status: "cancelled" });
    const res = await patch({ helperId: "6650a1f2c3d4e5f6a7b8c9b2" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("class_time_cancelled");
  });

  it("stays as it was when booking can't be told", async () => {
    ctx.events.down = true;
    expect((await patch({ status: "cancelled" })).status).toBe(503);

    const [stored] = (await ctx.call("get", "/catalog/class-times")).body.items;
    expect(stored.status).toBe("published");
  });

  it("can't change once it has started", async () => {
    ctx.clock.time += 49 * HOUR;
    const res = await patch({ status: "cancelled" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("class_started");
  });

  it("takes a helper or a status, not both", async () => {
    const res = await patch({
      status: "cancelled",
      helperId: "6650a1f2c3d4e5f6a7b8c9b2",
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 for a class time that doesn't exist", async () => {
    const res = await ctx
      .call("patch", "/catalog/class-times/6650a1f2c3d4e5f6a7b8ffff")
      .send({ status: "cancelled" });
    expect(res.status).toBe(404);
  });
});

describe("what booking reads", () => {
  it("needs the internal token", async () => {
    const path = `/internal/catalog/class-times?classId=${khaoSoi.id}`;
    expect((await ctx.call("get", path, null)).status).toBe(401);
    expect(
      (await internal(path, "wrong-token-wrong-token-wrong-token")).status,
    ).toBe(401);
    expect((await ctx.call("get", path)).status).toBe(401);
  });

  it("lists published times of one class in order, between from and to", async () => {
    const helperId = "6650a1f2c3d4e5f6a7b8c9b1";
    const ids = [];
    for (const hours of [72, 24, 48]) {
      const time = await addTime(hours);
      const res = await makeClassTime({
        classId: khaoSoi.id,
        availableTimeId: time.id,
        helperId,
      });
      ids.push(res.body.id);
    }
    const all = await internal(
      `/internal/catalog/class-times?classId=${khaoSoi.id}`,
    );
    expect(all.body.items.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);

    const window = await internal(
      `/internal/catalog/class-times?classId=${khaoSoi.id}&from=${q(inHours(30))}&to=${q(inHours(60))}`,
    );
    expect(window.body.items.map((t) => t.id)).toEqual([ids[2]]);
  });

  it("gives a class time with its class, Yai, seats and shopping list", async () => {
    await ctx.call("put", `/catalog/classes/${khaoSoi.id}/recipe`).send({
      ingredients: [
        {
          id: "noodles",
          name: "Egg noodles",
          nameThai: "บะหมี่ไข่",
          quantity: "200 g",
        },
      ],
      steps: [{ text: "Boil the noodles." }],
    });
    const time = await addTime(48);
    const draft = await makeClassTime({
      classId: khaoSoi.id,
      availableTimeId: time.id,
    });

    const res = await internal(
      `/internal/catalog/class-times/${draft.body.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.classTime).toMatchObject({ status: "draft", capacity: 4 });
    expect(res.body.class).toMatchObject({
      id: khaoSoi.id,
      dishThai: "ข้าวซอย",
    });
    expect(res.body.yai).toMatchObject({ id: somsri.id, isSample: true });
    expect(res.body.ingredients).toEqual([
      {
        id: "noodles",
        name: "Egg noodles",
        nameThai: "บะหมี่ไข่",
        quantity: "200 g",
      },
    ]);
    expect(
      (await internal("/internal/catalog/class-times/6650a1f2c3d4e5f6a7b8ffff"))
        .status,
    ).toBe(404);
  });
});
