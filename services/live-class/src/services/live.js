import { randomUUID } from "node:crypto";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from "@yais-kitchen/shared";

export function createLiveService({
  store: { Session },
  durable: d,
  catalog,
  booking,
  provider,
  media,
  now = () => new Date(),
}) {
  async function context(classTimeId) {
    const ctx = await catalog(`/internal/catalog/class-times/${classTimeId}`);
    const recipe = await catalog(`/catalog/classes/${ctx.class.id}/recipe`);
    return { ...ctx, recipe };
  }
  async function authorize(ctx, user, control = false) {
    if (
      user.role === "admin" ||
      (user.role === "helper" && ctx.classTime.helperId === user.id)
    )
      return;
    if (control) throw forbidden();
    if (user.role === "family" && user.yaiId === ctx.yai.id) return;
    if (user.role === "tourist") {
      const { userIds } = await booking(
        `/internal/booking/class-times/${ctx.classTime.id}/participants`,
      );
      if (userIds.includes(user.id)) return;
    }
    throw forbidden();
  }
  async function ensure(classTimeId, total) {
    try {
      await Session.updateOne(
        { _id: classTimeId },
        {
          $setOnInsert: {
            room: `class-${classTimeId}`,
            total,
            version: 0,
            step: 0,
            recording: "off",
            participants: [],
          },
        },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  const identity = (user) => `${user.role}-${user.id}`;
  const unanimous = (row) =>
    row.participants.length > 0 &&
    row.participants.every(
      (p) => p.consent?.sid === p.sid && p.consent?.agree === true,
    );
  const view = (row) => ({
    classTimeId: row._id,
    version: row.version,
    step: { index: row.step, total: row.total },
    recording: { status: row.recording, everyoneAgreed: unanimous(row) },
    endedAt: row.endedAt?.toISOString() || null,
    notice:
      "Recording is off until each current connection explicitly consents. Reconnecting requires fresh consent.",
    participants: row.participants.map((p) => ({
      identity: p.identity,
      sid: p.sid,
      agreed: p.consent?.agree === true,
    })),
    captions: row.captions,
  });
  async function broadcast(row, message) {
    // Commit the state change and its broadcast in the same transaction.
    row.$locals.events ??= [];
    row.$locals.events.push([
      "live_class.state.changed",
      {
        classTimeId: row._id,
        version: row.version + 1,
        message,
      },
    ]);
  }
  async function stop(row) {
    if (row.recording === "recording" && row.egressId) {
      await provider.stop(row.egressId);
      row.recording = "stopped";
    }
  }
  async function mutate(classTimeId, work) {
    // Compare-and-swap reserves a lease across provider side effects, preventing
    // concurrent consent/start/end transitions across service instances.
    const lease = randomUUID();
    const locked = await Session.collection.findOneAndUpdate(
      {
        _id: classTimeId,
        $or: [{ lease: null }, { leaseUntil: { $lt: now() } }],
      },
      { $set: { lease, leaseUntil: new Date(+now() + 60000) } },
      { returnDocument: "after" },
    );
    if (!locked)
      throw conflict("session_busy", "The class is updating. Please retry.");
    try {
      const row = await Session.findById(classTimeId);
      await work(row);
      row.version++;
      await d.transaction(async (session) => {
        const current = await Session.collection.findOne(
          { _id: classTimeId, lease, leaseUntil: { $gt: now() } },
          { session },
        );
        if (!current)
          throw conflict(
            "session_busy",
            "The class update lease expired. Please retry.",
          );
        await row.save({ session });
        for (const [type, data] of row.$locals.events ?? [])
          await d.enqueue(session, type, data);
      });
      return view(row);
    } finally {
      await Session.collection.updateOne(
        { _id: classTimeId, lease },
        { $unset: { lease: "", leaseUntil: "" } },
      );
    }
  }
  async function sync(row) {
    const actual = (await provider.participants(row.room)).filter(
      (p) => p.kind !== 2,
    );
    const previous = row.participants;
    row.participants = actual.map((p) => ({
      identity: p.identity,
      sid: p.sid,
      consent: previous.find(
        (old) => old.identity === p.identity && old.sid === p.sid,
      )?.consent,
    }));
    if (!unanimous(row)) await stop(row);
  }
  const api = {
    async maintenance() {
      // Reconcile provider state after missing webhooks or process restarts.
      for (const row of await Session.find({ endedAt: null }).limit(100)) {
        try {
          await mutate(row._id, async (current) => {
            if (provider.activeRecordings) {
              const active = await provider.activeRecordings(current.room);
              for (const recording of active) {
                if (recording.egressId !== current.egressId)
                  await provider.stop(recording.egressId);
              }
            }
            await sync(current);
          });
        } catch (error) {
          if (error.code !== "session_busy") throw error;
        }
      }
    },
    async join(classTimeId, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user);
      if (
        ctx.classTime.status === "cancelled" ||
        +now() < +new Date(ctx.classTime.startsAt) - 600000 ||
        now() >= new Date(ctx.classTime.endsAt)
      )
        throw conflict("join_closed", "Joining is not available now.");
      await ensure(classTimeId, ctx.recipe.steps.length);
      const row = await Session.findById(classTimeId);
      if (row.endedAt) throw conflict("class_ended", "This class has ended.");
      // Stop before issuing a ticket to a potentially nonconsenting connection.
      let token;
      await mutate(classTimeId, async (row) => {
        if (row.endedAt) throw conflict("class_ended", "This class has ended.");
        await stop(row);
        await provider.room(row.room);
        token = await provider.token(row.room, identity(user));
        row.joinTicketsExpireAt = new Date(+now() + 125000);
      });
      return {
        serverUrl: provider.serverUrl,
        token,
        identity: identity(user),
        participantRole: user.role === "family" ? "yai" : user.role,
        expiresAt: new Date(+now() + 120000).toISOString(),
        recordingNotice:
          "Explicit consent is required for this connection before recording.",
      };
    },
    async state(classTimeId, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user);
      await ensure(classTimeId, ctx.recipe.steps.length);
      return mutate(classTimeId, sync);
    },
    async step(classTimeId, index, user, expectedVersion) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user, true);
      await ensure(classTimeId, ctx.recipe.steps.length);
      if (index < 0 || index >= ctx.recipe.steps.length)
        throw badRequest("Invalid recipe step.");
      return mutate(classTimeId, async (row) => {
        if (row.endedAt) throw conflict("class_ended", "This class has ended.");
        if (expectedVersion !== undefined && expectedVersion !== row.version)
          throw conflict("stale_version", "Refresh the class state.");
        row.step = index;
        await broadcast(row, {
          type: "recipe.step",
          index,
          version: row.version + 1,
        });
      });
    },
    async consent(classTimeId, agree, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user);
      return mutate(classTimeId, async (row) => {
        await sync(row);
        const p = row.participants.find((p) => p.identity === identity(user));
        if (!p)
          throw conflict(
            "not_connected",
            "Join the call before giving consent.",
          );
        const consent = {
          agree,
          sid: p.sid,
          identity: p.identity,
          at: now().toISOString(),
          noticeVersion: "recording-v1",
        };
        p.consent = consent;
        row.consentAudit.push(consent);
        row.markModified("participants");
        if (!agree) await stop(row);
      });
    },
    async recording(classTimeId, action, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user, true);
      return mutate(classTimeId, async (row) => {
        await sync(row);
        if (action === "stop") {
          await stop(row);
          return;
        }
        if (row.endedAt) throw conflict("class_ended", "This class has ended.");
        if (!unanimous(row))
          throw conflict(
            "consent_required",
            "Everyone in the call must explicitly consent.",
          );
        // A join ticket can be reused until it expires. Wait out every issued
        // ticket (plus clock tolerance) so it cannot admit a fresh connection
        // after our participant/consent snapshot while recording is starting.
        if (row.joinTicketsExpireAt > now())
          throw conflict(
            "join_tickets_active",
            "Wait for outstanding join tickets to expire before recording.",
          );
        if (row.recording === "recording") return;
        const result = await provider.start(row.room);
        row.egressId = result.egressId;
        row.recording = "recording";
        await sync(row);
      });
    },
    async recordingLink(classTimeId, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user);
      const row = await Session.findById(classTimeId);
      if (!row?.objectKey || row.deleteAfter <= now()) throw notFound();
      if (!media) throw serviceUnavailable("Media storage is unavailable.");
      return media("/internal/media/signed-links", {
        objectKey: row.objectKey,
        expiresInSeconds: 3600,
      });
    },
    async caption(classTimeId, input, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user, true);
      return mutate(classTimeId, async (row) => {
        if (row.endedAt) throw conflict("class_ended", "This class has ended.");
        const segment = {
          ...input,
          participantIdentity: identity(user),
          timestamp: now().toISOString(),
        };
        const index = row.captions.findIndex(
          (c) => c.segmentId === segment.segmentId,
        );
        if (index >= 0) {
          if (row.captions[index].final)
            throw conflict("caption_final", "This caption is final.");
          row.captions[index] = segment;
        } else row.captions.push(segment);
        row.captions = row.captions.slice(-100);
        await broadcast(row, { type: "caption", ...segment });
      });
    },
    async end(classTimeId, user) {
      const ctx = await context(classTimeId);
      await authorize(ctx, user, true);
      if (now() < new Date(ctx.classTime.startsAt))
        throw conflict("class_not_started", "The class has not started.");
      await ensure(classTimeId, ctx.recipe.steps.length);
      return mutate(classTimeId, async (row) => {
        if (row.endedAt) return;
        await stop(row);
        await provider.end(row.room);
        row.endedAt = now();
        row.$locals.events ??= [];
        row.$locals.events.push([
          "live_class.ended",
          {
            classTimeId,
            endedAt: row.endedAt.toISOString(),
          },
        ]);
      });
    },
    async webhook(raw, authorization) {
      let event;
      try {
        event = await provider.verify(raw, authorization);
      } catch {
        throw badRequest("Invalid LiveKit signature.");
      }
      const room = event.room?.name || event.egressInfo?.roomName;
      const row = await Session.findOne({ room });
      if (!row) return { received: true };
      if (
        event.event === "participant_joined" ||
        event.event === "participant_left"
      )
        await mutate(row._id, sync);
      if (event.event === "egress_ended") {
        await d.receive(
          {
            ...event,
            id: event.id || `${event.egressInfo.egressId}:${event.event}`,
          },
          async (session) => {
            const info = event.egressInfo;
            if (info.egressId !== row.egressId)
              throw badRequest("Unknown recording.");
            const file = info.fileResults?.[0];
            const updates = { recording: "stopped" };
            if (info.status === 3 && file) {
              updates.objectKey = file.filename;
              updates.deleteAfter = new Date(
                +new Date((await context(row._id)).classTime.endsAt) +
                  90 * 86400000,
              );
              await d.enqueue(session, "recording.ready", {
                classTimeId: row._id,
                objectKey: file.filename,
                durationSeconds: Math.floor(Number(file.duration) / 1e9),
                deleteAfter: updates.deleteAfter.toISOString(),
              });
            }
            await Session.updateOne({ _id: row._id }, updates, { session });
          },
        );
      }
      return { received: true };
    },
    handlers: {
      "live_class.state.changed": (event) =>
        d.receive(event, async () => {
          await provider.broadcast(
            `class-${event.data.classTimeId}`,
            event.data.message,
          );
        }),
    },
  };
  return api;
}
