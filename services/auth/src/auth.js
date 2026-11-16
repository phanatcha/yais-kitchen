import { randomUUID } from "node:crypto";
import {
  badRequest,
  conflict,
  HttpError,
  notFound,
  unauthorized,
} from "@yais-kitchen/shared";
import mongoose from "mongoose";
import {
  ACCESS_SECONDS,
  GUEST_SECONDS,
  hashToken,
  newCode,
  newRefreshToken,
} from "./secrets.js";

export const CODE_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
// Two tabs refreshing at once both send the same token. The second one, within
// this window, still gets an access token.
export const REFRESH_GRACE_MS = 10 * 1000;

const wrongCode = () =>
  new HttpError(
    401,
    "wrong_code",
    "That code isn't right. Check the email and try again.",
  );
const codeExpired = () =>
  new HttpError(
    401,
    "code_expired",
    "That code has run out. Ask for a new one.",
  );
const codeLocked = () =>
  new HttpError(
    401,
    "code_locked",
    "Too many wrong tries for that code. Ask for a new one.",
  );

const accountDisabled = () =>
  new HttpError(
    403,
    "account_disabled",
    "This account is turned off. Contact us if you think this is a mistake.",
  );

// At most this many people come back from one internal lookup, which is
// more than any Yai has family members.
const INTERNAL_LIST_MAX = 100;
const AUDIT_CURSOR = /^(\d{1,15})_([\w-]{1,64})$/;

const wrongField = (field, message) =>
  badRequest(undefined, [{ field, message }]);

/** The name a new account gets before the person gives one. */
const nameFromEmail = (email) => email.split("@")[0].slice(0, 80);

function cleanName(name) {
  const trimmed = name.trim();
  if (!trimmed)
    throw badRequest(undefined, [{ field: "name", message: "is empty" }]);
  return trimmed;
}

/** A user as the API shows it. */
export function toUser(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    ...(doc.yaiId && { yaiId: doc.yaiId }),
    createdAt: doc.createdAt.toISOString(),
    ...(doc.disabledAt && { disabledAt: doc.disabledAt.toISOString() }),
  };
}

/** A user as other services see them, to email them. */
function toInternalUser(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    ...(doc.yaiId && { yaiId: doc.yaiId }),
    disabled: Boolean(doc.disabledAt),
  };
}

/** An audit entry as the API shows it. */
export function toAuditEntry(doc) {
  return {
    id: doc._id,
    service: doc.service,
    action: doc.action,
    method: doc.method,
    path: doc.path,
    target: doc.target ?? {},
    status: doc.status,
    actor: {
      id: doc.actor.id,
      role: doc.actor.role,
      ...(doc.actor.name && { name: doc.actor.name }),
      ...(doc.actor.email && { email: doc.actor.email }),
    },
    changes: doc.changes ?? {},
    ...(doc.requestId && { requestId: doc.requestId }),
    at: doc.at.toISOString(),
  };
}

/**
 * Everything auth does, without HTTP. Emails come in already lower case.
 * @param {object} options
 * @param {ReturnType<typeof import("./store.js").createStore>} options.store
 * @param {Awaited<ReturnType<typeof import("./secrets.js").createTokenSigner>>} options.signer
 * @param {ReturnType<typeof import("./secrets.js").createCodeHasher>} options.hasher
 * @param {{ publish: (type: string, data: object) => Promise<unknown> }} options.events
 * @param {import("pino").Logger} options.logger
 * @param {() => Date} [options.now]
 */
export function createAuth({ store, signer, hasher, events, logger, now }) {
  const { User, SignInCode, Session, AuditEntry } = store;
  now ??= () => new Date();
  const later = (ms) => new Date(now().getTime() + ms);

  async function requestCode(email) {
    const code = newCode();
    const expiresAt = later(CODE_MS);
    await SignInCode.replaceOne(
      { _id: email },
      { codeHash: hasher.hash(email, code), tries: 0, expiresAt },
      { upsert: true },
    );
    // Notification emails it. If RabbitMQ is down this throws 503 and the
    // person asks again.
    await events.publish("auth.code_requested", {
      email,
      code,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /** Uses up the code if it is right, or throws why not. */
  async function useCode(email, code) {
    // Count the try before comparing, in one step, so tries sent at the same
    // moment can't get past the limit.
    const counted = await SignInCode.findOneAndUpdate(
      { _id: email, tries: { $lt: MAX_TRIES }, expiresAt: { $gt: now() } },
      { $inc: { tries: 1 } },
      { returnDocument: "after", lean: true },
    );
    if (!counted) {
      const stored = await SignInCode.findById(email).lean();
      if (!stored) throw wrongCode();
      if (stored.expiresAt <= now()) throw codeExpired();
      throw codeLocked();
    }
    if (!hasher.matches(email, code, counted.codeHash)) {
      throw counted.tries >= MAX_TRIES ? codeLocked() : wrongCode();
    }
    // Each code works once. If two requests got here with it, one wins.
    const { deletedCount } = await SignInCode.deleteOne({
      _id: email,
      codeHash: counted.codeHash,
    });
    if (deletedCount !== 1) throw wrongCode();
  }

  /** The account for this email, made as a tourist's if there is none. */
  function findOrCreateTourist(email, name) {
    return User.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, name, role: "tourist", createdAt: now() } },
      { upsert: true, returnDocument: "after", lean: true },
    );
  }

  async function sessionFor(doc) {
    const user = toUser(doc);
    return {
      accessToken: await signer.access(user),
      expiresIn: ACCESS_SECONDS,
      user,
    };
  }

  async function startSession(doc) {
    const refreshToken = newRefreshToken();
    await Session.create({
      userId: doc._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: later(SESSION_MS),
    });
    return { refreshToken, session: await sessionFor(doc) };
  }

  // A deleted or turned-off account loses the session it still had.
  async function userOfSession(session) {
    const user = await User.findById(session.userId).lean();
    if (user && !user.disabledAt) return user;
    await Session.deleteOne({ _id: session._id });
    throw unauthorized();
  }

  async function findUser(id) {
    const doc = mongoose.isValidObjectId(id)
      ? await User.findById(id).lean()
      : null;
    if (!doc) throw notFound();
    return doc;
  }

  return {
    requestCode,

    async signIn(email, code) {
      await useCode(email, code);
      const doc = await findOrCreateTourist(email, nameFromEmail(email));
      if (doc.disabledAt) throw accountDisabled();
      return startSession(doc);
    },

    /**
     * Swaps a refresh token for a new one and an access token. `refreshToken`
     * is null when no new cookie should be set.
     */
    async refresh(token) {
      const hash = hashToken(token);
      const nextToken = newRefreshToken();
      const rotated = await Session.findOneAndUpdate(
        { tokenHash: hash, expiresAt: { $gt: now() } },
        {
          $set: {
            tokenHash: hashToken(nextToken),
            previousTokenHash: hash,
            rotatedAt: now(),
            expiresAt: later(SESSION_MS),
          },
        },
        { lean: true },
      );
      if (rotated) {
        const user = await userOfSession(rotated);
        return { refreshToken: nextToken, session: await sessionFor(user) };
      }

      const used = await Session.findOne({ previousTokenHash: hash }).lean();
      if (!used) throw unauthorized();
      if (now() - used.rotatedAt < REFRESH_GRACE_MS) {
        const user = await userOfSession(used);
        return { refreshToken: null, session: await sessionFor(user) };
      }
      // A token that was already swapped is back much later. Someone may
      // have copied it, so the whole session ends.
      await Session.deleteOne({ _id: used._id });
      logger.warn(
        { userId: used.userId.toString() },
        "an old refresh token came back, so its session was ended",
      );
      throw unauthorized();
    },

    async signOut(token) {
      const hash = hashToken(token);
      await Session.deleteOne({
        $or: [{ tokenHash: hash }, { previousTokenHash: hash }],
      });
    },

    async startGuestSession(email, name) {
      const given = cleanName(name);
      const doc = await findOrCreateTourist(email, given);
      if (doc.disabledAt) throw accountDisabled();
      if (doc.role !== "tourist") {
        throw conflict(
          "sign_in_needed",
          "This email has a staff account. Please sign in with a code.",
        );
      }
      // The name typed now, never the saved one, and no `createdAt`: the
      // answer must not tell anyone about an existing account.
      const user = {
        id: doc._id.toString(),
        email,
        name: given,
        role: "tourist",
      };
      return {
        accessToken: await signer.guest(user),
        expiresIn: GUEST_SECONDS,
        user,
      };
    },

    async getUser(id) {
      const doc = mongoose.isValidObjectId(id)
        ? await User.findById(id).lean()
        : null;
      // The account was deleted or turned off after the token was made.
      if (!doc || doc.disabledAt) throw unauthorized();
      return toUser(doc);
    },

    async deleteUser(id) {
      // Tell the other services first. If that fails, nothing is deleted and
      // the person can try again; if deleting fails after, they try again and
      // the services forget a second time, which is harmless.
      await events.publish("user.deleted", { userId: id });
      const doc = await User.findByIdAndDelete(id).lean();
      await Session.deleteMany({ userId: id });
      if (doc) await SignInCode.deleteOne({ _id: doc.email });
    },

    async listUsers({ role, limit, cursor }) {
      if (cursor !== undefined && !/^[a-f0-9]{24}$/.test(cursor)) {
        throw badRequest(undefined, [
          { field: "cursor", message: "isn't a page of this list" },
        ]);
      }
      const docs = await User.find({
        ...(role && { role }),
        ...(cursor && { _id: { $gt: cursor } }),
      })
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
      const items = docs.slice(0, limit);
      return {
        items: items.map(toUser),
        nextCursor: docs.length > limit ? items.at(-1)._id.toString() : null,
      };
    },

    /**
     * Admin changes someone's name or role, or turns the account off or back
     * on. A change of role, Yai or a turned-off account ends every session,
     * so the person signs in again with the new rights. An access token
     * already given out still works until it runs out, at most 15 minutes.
     * Nobody can change their own role or turn off their own account, so
     * there is always an admin left.
     */
    async updateUser(id, { name, role, yaiId, disabled }, actor) {
      const doc = await findUser(id);
      const newRole = role ?? doc.role;
      const roleChanges = newRole !== doc.role;
      if (doc._id.toString() === actor.id && (roleChanges || disabled)) {
        throw conflict(
          "own_account",
          "You can't change your own role or turn off your own account.",
        );
      }

      let newYaiId = yaiId ?? doc.yaiId;
      if (newRole === "family" && !newYaiId) {
        throw wrongField("yaiId", "is needed for a family account");
      }
      if (newRole !== "family") {
        if (yaiId) throw wrongField("yaiId", "is only for family accounts");
        newYaiId = undefined;
      }

      const set = {};
      const unset = {};
      if (name !== undefined) set.name = cleanName(name);
      if (roleChanges) set.role = newRole;
      if (newYaiId) set.yaiId = newYaiId;
      else if (doc.yaiId) unset.yaiId = "";
      if (disabled === true && !doc.disabledAt) set.disabledAt = now();
      if (disabled === false && doc.disabledAt) unset.disabledAt = "";

      const update = {
        ...(Object.keys(set).length > 0 && { $set: set }),
        ...(Object.keys(unset).length > 0 && { $unset: unset }),
      };
      if (Object.keys(update).length === 0) return toUser(doc);
      const updated = await User.findByIdAndUpdate(doc._id, update, {
        returnDocument: "after",
        lean: true,
      });
      if (!updated) throw notFound();

      const yaiChanges = (updated.yaiId ?? null) !== (doc.yaiId ?? null);
      if (roleChanges || yaiChanges || set.disabledAt) {
        await Session.deleteMany({ userId: doc._id });
        logger.info({ userId: id }, "account changed; its sessions were ended");
      }
      return toUser(updated);
    },

    /** One person, for another service to email. */
    async internalGetUser(id) {
      return toInternalUser(await findUser(id));
    },

    /** People with this role, such as the family of one Yai. Never turned-off accounts. */
    async internalListUsers({ role, yaiId }) {
      const docs = await User.find({
        role,
        ...(yaiId && { yaiId }),
        disabledAt: null,
      })
        .sort({ _id: 1 })
        .limit(INTERNAL_LIST_MAX)
        .lean();
      return { items: docs.map(toInternalUser) };
    },

    /**
     * Keeps one audit entry. `id` is the event's ID for entries from other
     * services, so an event that arrives twice is kept once.
     */
    async recordAudit(entry, id = randomUUID()) {
      try {
        await AuditEntry.create({ ...entry, _id: id, at: new Date(entry.at) });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    },

    /** Newest first, across every service. */
    async listAudit({ service, actorId, limit, cursor }) {
      const filter = {
        ...(service && { service }),
        ...(actorId && { "actor.id": actorId }),
      };
      if (cursor !== undefined) {
        const match = AUDIT_CURSOR.exec(cursor);
        if (!match) throw wrongField("cursor", "isn't a page of this list");
        const at = new Date(Number(match[1]));
        filter.$or = [{ at: { $lt: at } }, { at, _id: { $lt: match[2] } }];
      }
      const docs = await AuditEntry.find(filter)
        .sort({ at: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const items = docs.slice(0, limit);
      const last = items.at(-1);
      return {
        items: items.map(toAuditEntry),
        nextCursor:
          docs.length > limit ? `${last.at.getTime()}_${last._id}` : null,
      };
    },

    async createUser({ email, name, role, yaiId }) {
      if (role === "family" && !yaiId) {
        throw badRequest(undefined, [
          { field: "yaiId", message: "is needed for a family account" },
        ]);
      }
      if (role !== "family" && yaiId) {
        throw badRequest(undefined, [
          { field: "yaiId", message: "is only for family accounts" },
        ]);
      }
      try {
        const doc = await User.create({
          email,
          name: cleanName(name),
          role,
          yaiId,
          createdAt: now(),
        });
        return toUser(doc.toObject());
      } catch (error) {
        if (error?.code === 11000) {
          throw conflict(
            "email_taken",
            "An account with this email already exists.",
          );
        }
        throw error;
      }
    },
  };
}
