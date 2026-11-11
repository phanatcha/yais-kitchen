import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import { createStore } from "../src/models/store.js";
import { createLiveApp } from "../src/app.js";
import { harness, ids } from "../../booking/tests/helpers.js";

describe("live access, persisted state and recording consent", () => {
  let h, app, api, provider, participants, allowed;
  const helper = { id: ids.helper, role: "helper" };
  const family = { id: ids.other, role: "family", yaiId: ids.yai };
  const member = (identity, sid) => ({ identity, sid, kind: 0 });
  beforeAll(async () => {
    h = await harness(createStore);
  }, 120000);
  afterAll(async () => h?.close());
  beforeEach(async () => {
    await h.clear();
    h.clock.time = Date.parse("2027-01-04T00:00:00Z");
    allowed = [ids.user];
    participants = [];
    provider = {
      serverUrl: "wss://test.livekit.example",
      room: vi.fn(async () => {}),
      token: vi.fn(async () => "test-token"),
      participants: vi.fn(async () => participants),
      broadcast: vi.fn(async () => {}),
      start: vi.fn(async () => ({ egressId: "EG_test" })),
      stop: vi.fn(async () => {}),
      end: vi.fn(async () => {}),
      verify: vi.fn(async (raw) => JSON.parse(raw)),
    };
    app = createLiveApp({
      ...h.options,
      booking: async () => ({ userIds: allowed }),
      provider,
      media: async () => ({
        url: "https://private.example.test/signed",
        expiresAt: new Date(h.clock.time + 3600000).toISOString(),
      }),
    });
    api = app.locals.service;
  });
  async function connected() {
    await api.join(ids.time, h.user);
    participants = [
      member(`tourist-${ids.user}`, "PA_tourist"),
      member(`helper-${ids.helper}`, "PA_helper"),
    ];
    await api.state(ids.time, h.user);
  }
  async function agreed() {
    await connected();
    await api.consent(ids.time, true, h.user);
    await api.consent(ids.time, true, helper);
    h.clock.time += 125001;
  }
  it("does not start recording while an issued join ticket could admit a fresh connection", async () => {
    await connected();
    await api.consent(ids.time, true, h.user);
    await api.consent(ids.time, true, helper);
    await expect(
      api.recording(ids.time, "start", helper),
    ).rejects.toMatchObject({ code: "join_tickets_active" });
    expect(provider.start).not.toHaveBeenCalled();
  });
  it("issues a validated join ticket to booked tourist", async () => {
    const res = await request(app)
      .post(`/live/class-times/${ids.time}/join`)
      .set("Authorization", await h.auth());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.identity).toBe(`tourist-${ids.user}`);
  });
  it("validates helper step, consent, captions, recording and end API responses", async () => {
    await connected();
    const touristToken = await h.auth();
    const helperToken = await h.auth("helper", ids.helper);
    const base = `/live/class-times/${ids.time}`;
    let res = await request(app)
      .put(`${base}/step`)
      .set("Authorization", helperToken)
      .send({ index: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    for (const token of [touristToken, helperToken]) {
      res = await request(app)
        .post(`${base}/consent`)
        .set("Authorization", token)
        .send({ agree: true });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    h.clock.time += 125001;
    res = await request(app)
      .post(`${base}/recording`)
      .set("Authorization", helperToken)
      .send({ action: "start" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    res = await request(app)
      .post(`${base}/captions`)
      .set("Authorization", helperToken)
      .send({
        segmentId: "api-segment",
        language: "en",
        text: "Stir gently",
        final: true,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    res = await request(app)
      .get(`${base}/state`)
      .set("Authorization", touristToken);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    res = await request(app)
      .post(`${base}/end`)
      .set("Authorization", helperToken);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
  it.each(["unpaid", "cancelled", "unrelated"])(
    "rejects %s tourist",
    async () => {
      allowed = [];
      await expect(api.join(ids.time, h.user)).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it("allows assigned helper", async () => {
    expect((await api.join(ids.time, helper)).participantRole).toBe("helper");
  });
  it("rejects unassigned helper", async () => {
    await expect(
      api.join(ids.time, { ...helper, id: ids.other }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allows associated family device", async () => {
    expect((await api.join(ids.time, family)).participantRole).toBe("yai");
  });
  it("rejects joining before ten minutes", async () => {
    h.clock.time -= 600001;
    await expect(api.join(ids.time, h.user)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("maps all joins to one logical room", async () => {
    await api.join(ids.time, h.user);
    await api.join(ids.time, helper);
    expect(await h.store.Session.countDocuments()).toBe(1);
    expect(
      provider.room.mock.calls.every(([name]) => name === `class-${ids.time}`),
    ).toBe(true);
  });
  it("helper advances step and persists reconnect state", async () => {
    await connected();
    await api.step(ids.time, 1, helper);
    expect((await api.state(ids.time, h.user)).step.index).toBe(1);
  });
  it("tourist cannot advance recipe", async () => {
    await connected();
    await expect(api.step(ids.time, 1, h.user)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects step beyond actual recipe", async () => {
    await connected();
    await expect(api.step(ids.time, 3, helper)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("rejects stale step versions", async () => {
    await connected();
    await expect(api.step(ids.time, 1, helper, 0)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("requires explicit consent from each connection", async () => {
    await connected();
    expect((await api.state(ids.time, h.user)).recording.everyoneAgreed).toBe(
      false,
    );
    await expect(
      api.recording(ids.time, "start", helper),
    ).rejects.toMatchObject({ code: "consent_required" });
  });
  it("cannot record with only some consents", async () => {
    await connected();
    await api.consent(ids.time, true, h.user);
    await expect(
      api.recording(ids.time, "start", helper),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("starts only after unanimous explicit consent", async () => {
    await agreed();
    expect(
      (await api.recording(ids.time, "start", helper)).recording.status,
    ).toBe("recording");
  });
  it("withdrawal stops active recording and creates audit", async () => {
    await agreed();
    await api.recording(ids.time, "start", helper);
    expect((await api.consent(ids.time, false, h.user)).recording.status).toBe(
      "stopped",
    );
    expect(provider.stop).toHaveBeenCalledWith("EG_test");
    expect(
      (await h.store.Session.findById(ids.time)).consentAudit,
    ).toHaveLength(3);
  });
  it("new nonconsenting participant stops recording", async () => {
    await agreed();
    await api.recording(ids.time, "start", helper);
    participants.push(member(`family-${ids.other}`, "PA_new"));
    expect((await api.state(ids.time, h.user)).recording.status).toBe(
      "stopped",
    );
  });
  it("reconnecting with new sid requires fresh consent", async () => {
    await agreed();
    await api.recording(ids.time, "start", helper);
    participants[0].sid = "PA_reconnected";
    const state = await api.state(ids.time, h.user);
    expect(state.recording.status).toBe("stopped");
    expect(state.recording.everyoneAgreed).toBe(false);
  });
  it("recording completion persists private metadata and event", async () => {
    await agreed();
    await api.recording(ids.time, "start", helper);
    await api.webhook(
      Buffer.from(
        JSON.stringify({
          id: "EV_1",
          event: "egress_ended",
          egressInfo: {
            roomName: `class-${ids.time}`,
            egressId: "EG_test",
            status: 3,
            fileResults: [
              {
                filename: `recordings/${ids.time}.mp4`,
                duration: "120000000000",
              },
            ],
          },
        }),
      ),
      "signed",
    );
    const row = await h.store.Session.findById(ids.time);
    expect(row.objectKey).toContain("recordings/");
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "recording.ready" }),
    ).toBe(1);
  });
  it("rejects unauthorized recording access", async () => {
    await expect(
      api.recordingLink(ids.time, { ...h.user, id: ids.other }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allows private recording access to booked tourist", async () => {
    await connected();
    await h.store.Session.updateOne(
      { _id: ids.time },
      {
        objectKey: "recordings/test.mp4",
        deleteAfter: new Date(h.clock.time + 86400000),
      },
    );
    expect((await api.recordingLink(ids.time, h.user)).url).toContain("signed");
  });
  it("broadcasts language and final status in durable caption message", async () => {
    await connected();
    await api.caption(
      ids.time,
      { segmentId: "seg-1", language: "th", text: "สวัสดี", final: true },
      helper,
    );
    const row = await h.connection
      .collection("outbox")
      .findOne({ type: "live_class.state.changed" });
    expect(row.data.message).toMatchObject({
      language: "th",
      final: true,
      participantIdentity: `helper-${ids.helper}`,
    });
  });
  it("rejects captions from tourist", async () => {
    await connected();
    await expect(
      api.caption(ids.time, { language: "en" }, h.user),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("helper ends class and blocks further joining", async () => {
    await connected();
    await api.end(ids.time, helper);
    expect(provider.end).toHaveBeenCalled();
    await expect(api.join(ids.time, h.user)).rejects.toMatchObject({
      code: "class_ended",
    });
    expect(
      await h.connection
        .collection("outbox")
        .countDocuments({ type: "live_class.ended" }),
    ).toBe(1);
  });
  it("tourist cannot end class", async () => {
    await connected();
    await expect(api.end(ids.time, h.user)).rejects.toMatchObject({
      status: 403,
    });
  });
});
