import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_TRIES } from "../src/auth.js";
import {
  askForCode,
  refreshCookieOf,
  signIn,
  startAuth,
  startDatabase,
} from "./helpers.js";

const EMAIL = "guest@example.com";
const YAI_ID = "6650a1f2c3d4e5f6a7b8c9d1";
const MINUTE = 60 * 1000;

let db;
let ctx;

beforeAll(async () => {
  db = await startDatabase();
});
afterAll(() => db?.stop());
beforeEach(async () => {
  await db.clear();
  ctx = await startAuth(db.store);
});

const post = (path, body) => request(ctx.app).post(path).send(body);
const withCookie = (req, token) => req.set("cookie", `yk_refresh=${token}`);
const bearer = (req, token) => req.set("authorization", `Bearer ${token}`);
const wrongCodeFor = (code) =>
  String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function staff(role, email, extra = {}) {
  await db.store.User.create({
    email,
    name: `A ${role}`,
    role,
    createdAt: new Date(),
    ...extra,
  });
  return signIn(ctx, email);
}

describe("asking for a sign-in code", () => {
  it("sends a 6-digit code to notification and keeps only its hash", async () => {
    const res = await post("/auth/codes", { email: "Guest@Example.COM" });

    expect(res.status).toBe(202);
    const [event] = ctx.events.of("auth.code_requested");
    expect(event.data.email).toBe(EMAIL);
    expect(event.data.code).toMatch(/^\d{6}$/);
    expect(Date.parse(event.data.expiresAt)).toBe(ctx.clock.time + 10 * MINUTE);

    const stored = await db.store.SignInCode.findById(EMAIL).lean();
    expect(stored.tries).toBe(0);
    expect(stored.codeHash).not.toContain(event.data.code);
  });

  it("answers the same for an email with no account, and makes none yet", async () => {
    const res = await post("/auth/codes", { email: "new@example.com" });

    expect(res.status).toBe(202);
    expect(await db.store.User.countDocuments()).toBe(0);
  });

  it("replaces the old code with a new one", async () => {
    const first = await askForCode(ctx, EMAIL);
    const second = await askForCode(ctx, EMAIL);

    if (first !== second) {
      const old = await post("/auth/sessions", { email: EMAIL, code: first });
      expect(old.body.error.code).toBe("wrong_code");
    }
    expect(
      (await post("/auth/sessions", { email: EMAIL, code: second })).status,
    ).toBe(200);
  });

  it("answers 503 when the code can't be sent, so the person asks again", async () => {
    ctx.events.down = true;
    const res = await post("/auth/codes", { email: EMAIL });

    expect(res.status).toBe(503);
    expect(res.body.error.retryable).toBe(true);
  });

  it("refuses something that isn't an email", async () => {
    const res = await post("/auth/codes", { email: "not an email" });
    expect(res.status).toBe(400);
  });
});

describe("signing in with the code", () => {
  it("gives a 15-minute token and a refresh cookie for the right code", async () => {
    const code = await askForCode(ctx, EMAIL);
    const res = await post("/auth/sessions", {
      email: "GUEST@example.com",
      code,
    });

    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.user).toMatchObject({
      email: EMAIL,
      name: "guest",
      role: "tourist",
    });
    const claims = await ctx.verifyToken(res.body.accessToken);
    expect(claims).toMatchObject({
      id: res.body.user.id,
      role: "tourist",
      email: EMAIL,
      name: "guest",
    });

    const cookie = res.headers["set-cookie"].find((c) =>
      c.startsWith("yk_refresh="),
    );
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/auth/sessions");
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it("makes a tourist account on the first sign-in, and reuses it after", async () => {
    const first = await signIn(ctx, EMAIL);
    const second = await signIn(ctx, EMAIL);

    expect(second.user.id).toBe(first.user.id);
    expect(await db.store.User.countDocuments()).toBe(1);
  });

  it("refuses a wrong code", async () => {
    const code = await askForCode(ctx, EMAIL);
    const res = await post("/auth/sessions", {
      email: EMAIL,
      code: wrongCodeFor(code),
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      code: "wrong_code",
      retryable: false,
    });
    expect(refreshCookieOf(res)).toBeNull();
  });

  it("refuses a code with no code asked for", async () => {
    const res = await post("/auth/sessions", { email: EMAIL, code: "123456" });
    expect(res.body.error.code).toBe("wrong_code");
  });

  it("takes a code only for the email it was sent to", async () => {
    const code = await askForCode(ctx, EMAIL);
    const res = await post("/auth/sessions", {
      email: "other@example.com",
      code,
    });

    expect(res.body.error.code).toBe("wrong_code");
    expect((await post("/auth/sessions", { email: EMAIL, code })).status).toBe(
      200,
    );
  });

  it("refuses a code after 10 minutes", async () => {
    const code = await askForCode(ctx, EMAIL);
    ctx.clock.time += 10 * MINUTE;
    const res = await post("/auth/sessions", { email: EMAIL, code });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("code_expired");
  });

  it("still takes the code just before it runs out", async () => {
    const code = await askForCode(ctx, EMAIL);
    ctx.clock.time += 10 * MINUTE - 1000;
    expect((await post("/auth/sessions", { email: EMAIL, code })).status).toBe(
      200,
    );
  });

  it("works only once", async () => {
    const code = await askForCode(ctx, EMAIL);
    expect((await post("/auth/sessions", { email: EMAIL, code })).status).toBe(
      200,
    );
    const again = await post("/auth/sessions", { email: EMAIL, code });

    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("wrong_code");
  });

  it("locks the code after 5 wrong tries, even for the right code", async () => {
    const code = await askForCode(ctx, EMAIL);
    const wrong = wrongCodeFor(code);

    const answers = [];
    for (let i = 0; i < MAX_TRIES; i += 1) {
      answers.push(
        (await post("/auth/sessions", { email: EMAIL, code: wrong })).body.error
          .code,
      );
    }
    expect(answers).toEqual([
      "wrong_code",
      "wrong_code",
      "wrong_code",
      "wrong_code",
      "code_locked",
    ]);

    const right = await post("/auth/sessions", { email: EMAIL, code });
    expect(right.status).toBe(401);
    expect(right.body.error.code).toBe("code_locked");
  });

  it("counts tries sent at the same moment", async () => {
    const code = await askForCode(ctx, EMAIL);
    const wrong = wrongCodeFor(code);
    await Promise.all(
      Array.from({ length: 12 }, () =>
        post("/auth/sessions", { email: EMAIL, code: wrong }),
      ),
    );

    expect((await db.store.SignInCode.findById(EMAIL).lean()).tries).toBe(
      MAX_TRIES,
    );
    expect(
      (await post("/auth/sessions", { email: EMAIL, code })).body.error.code,
    ).toBe("code_locked");
  });

  it("lets one of two requests with the same code in", async () => {
    const code = await askForCode(ctx, EMAIL);
    const answers = await Promise.all([
      post("/auth/sessions", { email: EMAIL, code }),
      post("/auth/sessions", { email: EMAIL, code }),
    ]);

    expect(answers.map((res) => res.status).sort()).toEqual([200, 401]);
  });

  it("unlocks with a new code", async () => {
    const code = await askForCode(ctx, EMAIL);
    for (let i = 0; i < MAX_TRIES; i += 1) {
      await post("/auth/sessions", { email: EMAIL, code: wrongCodeFor(code) });
    }
    const fresh = await askForCode(ctx, EMAIL);
    expect(
      (await post("/auth/sessions", { email: EMAIL, code: fresh })).status,
    ).toBe(200);
  });

  it("refuses a code that isn't 6 digits", async () => {
    const res = await post("/auth/sessions", { email: EMAIL, code: "12345" });
    expect(res.status).toBe(400);
  });
});

describe("refreshing", () => {
  const refresh = (token) =>
    withCookie(request(ctx.app).post("/auth/sessions/refresh"), token);

  it("swaps the refresh cookie for a new one and a new access token", async () => {
    const { user, refresh: first } = await signIn(ctx, EMAIL);
    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect((await ctx.verifyToken(res.body.accessToken)).id).toBe(user.id);
    const second = refreshCookieOf(res);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect((await refresh(second)).status).toBe(200);
  });

  it("gives a second tab an access token but no new cookie", async () => {
    const { refresh: token } = await signIn(ctx, EMAIL);
    await refresh(token);
    ctx.clock.time += 5000;
    const late = await refresh(token);

    expect(late.status).toBe(200);
    expect(refreshCookieOf(late)).toBeNull();
  });

  it("ends the session when an old refresh token comes back later", async () => {
    const { refresh: stolen } = await signIn(ctx, EMAIL);
    const newer = refreshCookieOf(await refresh(stolen));
    ctx.clock.time += MINUTE;

    const reused = await refresh(stolen);
    expect(reused.status).toBe(401);
    expect(reused.headers["set-cookie"].join()).toContain("yk_refresh=;");
    // The rightful owner's token is gone too, so both must sign in again.
    expect((await refresh(newer)).status).toBe(401);
  });

  it("refuses with no cookie or an unknown one", async () => {
    expect((await request(ctx.app).post("/auth/sessions/refresh")).status).toBe(
      401,
    );
    const unknown = await refresh("made-up");
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("unauthorized");
  });

  it("refuses a session that hasn't been used for 30 days", async () => {
    const { refresh: token } = await signIn(ctx, EMAIL);
    ctx.clock.time += 30 * 24 * 60 * MINUTE;
    expect((await refresh(token)).status).toBe(401);
  });

  it("keeps a session going while it is used", async () => {
    let { refresh: token } = await signIn(ctx, EMAIL);
    for (let week = 0; week < 6; week += 1) {
      ctx.clock.time += 7 * 24 * 60 * MINUTE;
      const res = await refresh(token);
      expect(res.status).toBe(200);
      token = refreshCookieOf(res);
    }
  });

  it("puts the account's current role in the new token", async () => {
    const { user, refresh: token } = await signIn(ctx, EMAIL);
    await db.store.User.updateOne({ _id: user.id }, { role: "helper" });
    const res = await refresh(token);

    expect((await ctx.verifyToken(res.body.accessToken)).role).toBe("helper");
  });
});

describe("signing out", () => {
  const signOut = () => request(ctx.app).delete("/auth/sessions/current");

  it("ends the session and clears the cookie", async () => {
    const { refresh: token } = await signIn(ctx, EMAIL);
    const res = await withCookie(signOut(), token);

    expect(res.status).toBe(204);
    const cleared = res.headers["set-cookie"].find((c) =>
      c.startsWith("yk_refresh="),
    );
    expect(cleared).toContain("Path=/api/auth/sessions");
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
    const after = await withCookie(
      request(ctx.app).post("/auth/sessions/refresh"),
      token,
    );
    expect(after.status).toBe(401);
  });

  it("leaves other sessions of the same person alone", async () => {
    const phone = await signIn(ctx, EMAIL);
    const laptop = await signIn(ctx, EMAIL);
    await withCookie(signOut(), phone.refresh);

    const res = await withCookie(
      request(ctx.app).post("/auth/sessions/refresh"),
      laptop.refresh,
    );
    expect(res.status).toBe(200);
  });

  it("needs the cookie", async () => {
    expect((await signOut()).status).toBe(401);
  });
});

describe("guest checkout", () => {
  const startGuest = (email, name) =>
    post("/auth/guest-sessions", { email, name });

  it("gives a 30-minute guest token and makes a tourist account", async () => {
    const res = await startGuest(EMAIL, "  Alex ");

    expect(res.status).toBe(201);
    expect(res.body.expiresIn).toBe(1800);
    expect(res.body.user).toMatchObject({
      email: EMAIL,
      name: "Alex",
      role: "tourist",
    });
    const claims = await ctx.verifyToken(res.body.accessToken);
    expect(claims).toMatchObject({
      id: res.body.user.id,
      role: "guest",
      name: "Alex",
    });
    expect(claims.sessionId).toMatch(/^[0-9a-f-]{36}$/);

    const saved = await db.store.User.findById(res.body.user.id).lean();
    expect(saved).toMatchObject({
      email: EMAIL,
      name: "Alex",
      role: "tourist",
    });
    expect(refreshCookieOf(res)).toBeNull();
  });

  it("uses the existing account but never shows or changes its saved name", async () => {
    const first = await startGuest(EMAIL, "Alex");
    const second = await startGuest(EMAIL, "Someone Else");

    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.name).toBe("Someone Else");
    expect(second.body.user.createdAt).toBeUndefined();
    expect((await db.store.User.findById(first.body.user.id).lean()).name).toBe(
      "Alex",
    );
  });

  it("gives each checkout its own sid", async () => {
    const one = await ctx.verifyToken(
      (await startGuest(EMAIL, "Alex")).body.accessToken,
    );
    const two = await ctx.verifyToken(
      (await startGuest(EMAIL, "Alex")).body.accessToken,
    );
    expect(one.sessionId).not.toBe(two.sessionId);
  });

  it("sends staff to sign in instead", async () => {
    await db.store.User.create({
      email: "helper@example.com",
      name: "Helper",
      role: "helper",
      createdAt: new Date(),
    });
    const res = await startGuest("helper@example.com", "Helper");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("sign_in_needed");
  });

  it("refuses a blank name", async () => {
    const res = await startGuest(EMAIL, "   ");
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: "name", message: "is empty" },
    ]);
  });

  it("can't use a guest token to read the account", async () => {
    const { body } = await startGuest(EMAIL, "Alex");
    const res = await bearer(
      request(ctx.app).get("/auth/me"),
      body.accessToken,
    );
    expect(res.status).toBe(403);
  });
});

describe("roles", () => {
  const me = (token) => bearer(request(ctx.app).get("/auth/me"), token);
  const users = (token) => bearer(request(ctx.app).get("/auth/users"), token);

  it("lets every signed-in role read its own account", async () => {
    const people = {
      tourist: await signIn(ctx, EMAIL),
      family: await staff("family", "family@example.com", { yaiId: YAI_ID }),
      helper: await staff("helper", "helper@example.com"),
      admin: await staff("admin", "admin@example.com"),
    };

    for (const [role, person] of Object.entries(people)) {
      const res = await me(person.token);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(role);
      expect((await ctx.verifyToken(person.token)).role).toBe(role);
    }
  });

  it("puts the Yai in a family token", async () => {
    const family = await staff("family", "family@example.com", {
      yaiId: YAI_ID,
    });
    expect((await ctx.verifyToken(family.token)).yaiId).toBe(YAI_ID);
    expect((await me(family.token)).body.yaiId).toBe(YAI_ID);
  });

  it("lets only admins list and create users", async () => {
    const people = [
      await signIn(ctx, EMAIL),
      await staff("family", "family@example.com", { yaiId: YAI_ID }),
      await staff("helper", "helper@example.com"),
    ];
    for (const person of people) {
      expect((await users(person.token)).status).toBe(403);
      const create = await bearer(
        request(ctx.app).post("/auth/users"),
        person.token,
      ).send({
        email: "new@example.com",
        name: "New",
        role: "admin",
      });
      expect(create.status).toBe(403);
    }

    const admin = await staff("admin", "admin@example.com");
    expect((await users(admin.token)).status).toBe(200);
  });

  it("needs a token", async () => {
    expect((await request(ctx.app).get("/auth/me")).status).toBe(401);
    expect((await request(ctx.app).get("/auth/users")).status).toBe(401);
    expect((await request(ctx.app).delete("/auth/me")).status).toBe(401);
  });

  it("refuses a token from another key", async () => {
    const other = await startAuth(db.store);
    const { token } = await signIn(other, EMAIL);
    expect((await me(token)).status).toBe(401);
  });
});

describe("admin accounts", () => {
  let admin;
  beforeEach(async () => {
    admin = await staff("admin", "admin@example.com");
  });
  const create = (body) =>
    bearer(request(ctx.app).post("/auth/users"), admin.token).send(body);
  const list = (query = {}) =>
    bearer(request(ctx.app).get("/auth/users").query(query), admin.token);

  it("creates a helper, who can then sign in as one", async () => {
    const res = await create({
      email: "Helper@Example.com",
      name: "Helper",
      role: "helper",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "helper@example.com",
      role: "helper",
    });
    expect((await signIn(ctx, "helper@example.com")).user.role).toBe("helper");
  });

  it("creates a family account for a Yai", async () => {
    const res = await create({
      email: "family@example.com",
      name: "Family",
      role: "family",
      yaiId: YAI_ID,
    });
    expect(res.status).toBe(201);
    expect(res.body.yaiId).toBe(YAI_ID);
  });

  it("needs a Yai for a family account and refuses one for anyone else", async () => {
    const family = await create({
      email: "f@example.com",
      name: "F",
      role: "family",
    });
    expect(family.status).toBe(400);
    expect(family.body.error.details[0].field).toBe("yaiId");

    const helper = await create({
      email: "h@example.com",
      name: "H",
      role: "helper",
      yaiId: YAI_ID,
    });
    expect(helper.status).toBe(400);
    expect(helper.body.error.details[0].field).toBe("yaiId");
  });

  it("won't make tourists, who sign up by themselves", async () => {
    const res = await create({
      email: "t@example.com",
      name: "T",
      role: "tourist",
    });
    expect(res.status).toBe(400);
  });

  it("refuses an email that already has an account", async () => {
    await signIn(ctx, EMAIL);
    const res = await create({
      email: "GUEST@example.com",
      name: "G",
      role: "helper",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("lists users by role, one page at a time", async () => {
    for (let i = 0; i < 5; i += 1) {
      await create({
        email: `helper${i}@example.com`,
        name: `Helper ${i}`,
        role: "helper",
      });
    }
    await signIn(ctx, EMAIL);

    const first = await list({ role: "helper", limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.items.map((u) => u.email)).toEqual([
      "helper0@example.com",
      "helper1@example.com",
    ]);
    const second = await list({
      role: "helper",
      limit: 2,
      cursor: first.body.nextCursor,
    });
    const third = await list({
      role: "helper",
      limit: 2,
      cursor: second.body.nextCursor,
    });
    expect(third.body.items.map((u) => u.email)).toEqual([
      "helper4@example.com",
    ]);
    expect(third.body.nextCursor).toBeNull();

    const everyone = await list();
    expect(everyone.body.items).toHaveLength(7);
    expect(everyone.body.nextCursor).toBeNull();
  });

  it("refuses a cursor it didn't give out", async () => {
    const res = await list({ cursor: "page-2" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("cursor");
  });
});

describe("deleting an account", () => {
  const deleteMe = (token) =>
    bearer(request(ctx.app).delete("/auth/me"), token);

  it("tells every service, then removes the account, sessions and codes", async () => {
    const { token, user, refresh } = await signIn(ctx, EMAIL);
    await askForCode(ctx, EMAIL);
    const res = await deleteMe(token);

    expect(res.status).toBe(202);
    expect(res.headers["set-cookie"].join()).toContain("yk_refresh=;");
    expect(ctx.events.of("user.deleted").map((e) => e.data)).toEqual([
      { userId: user.id },
    ]);
    expect(await db.store.User.countDocuments()).toBe(0);
    expect(await db.store.Session.countDocuments()).toBe(0);
    expect(await db.store.SignInCode.countDocuments()).toBe(0);

    // The access token is still signed, but its account is gone.
    expect((await bearer(request(ctx.app).get("/auth/me"), token)).status).toBe(
      401,
    );
    const after = await withCookie(
      request(ctx.app).post("/auth/sessions/refresh"),
      refresh,
    );
    expect(after.status).toBe(401);
  });

  it("starts a new account if the email signs in again", async () => {
    const before = await signIn(ctx, EMAIL);
    await deleteMe(before.token);
    const after = await signIn(ctx, EMAIL);

    expect(after.user.id).not.toBe(before.user.id);
  });

  it("deletes nothing when the other services can't be told", async () => {
    const { token } = await signIn(ctx, EMAIL);
    ctx.events.down = true;
    const res = await deleteMe(token);

    expect(res.status).toBe(503);
    expect(await db.store.User.countDocuments()).toBe(1);
  });

  it("is only for tourists", async () => {
    const helper = await staff("helper", "helper@example.com");
    expect((await deleteMe(helper.token)).status).toBe(403);
  });
});
