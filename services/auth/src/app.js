import {
  createApp,
  serviceUnavailable,
  unauthorized,
} from "@yais-kitchen/shared";
import express from "express";
import { SESSION_MS } from "./auth.js";

export const REFRESH_COOKIE = "yk_refresh";
// The browser sees the gateway's paths, with /api. The cookie only goes to
// refresh and sign out.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/api/auth/sessions",
};

const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MS });
const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);

function readRefreshCookie(req) {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === REFRESH_COOKIE) return value.join("=") || undefined;
  }
  return undefined;
}

const emailOf = (body) => body.email.trim().toLowerCase();

/**
 * @param {ReturnType<typeof import("./auth.js").createAuth>} auth
 * @param {ReturnType<typeof import("@yais-kitchen/shared").createDeadLetters>} [deadLetters]
 */
export function authRoutes(auth, deadLetters) {
  const routes = express.Router();

  routes.post("/auth/codes", async (req, res) => {
    await auth.requestCode(emailOf(req.body));
    res.status(202).end();
  });

  routes.post("/auth/sessions", async (req, res) => {
    const { refreshToken, session } = await auth.signIn(
      emailOf(req.body),
      req.body.code,
    );
    setRefreshCookie(res, refreshToken);
    res.json(session);
  });

  routes.post("/auth/sessions/refresh", async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw unauthorized();
    try {
      const { refreshToken, session } = await auth.refresh(token);
      if (refreshToken) setRefreshCookie(res, refreshToken);
      res.json(session);
    } catch (error) {
      if (error?.status === 401) clearRefreshCookie(res);
      throw error;
    }
  });

  routes.delete("/auth/sessions/current", async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw unauthorized();
    await auth.signOut(token);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  routes.post("/auth/guest-sessions", async (req, res) => {
    const session = await auth.startGuestSession(
      emailOf(req.body),
      req.body.name,
    );
    res.status(201).json(session);
  });

  routes.get("/auth/me", async (req, res) => {
    res.json(await auth.getUser(req.user.id));
  });

  routes.delete("/auth/me", async (req, res) => {
    await auth.deleteUser(req.user.id);
    clearRefreshCookie(res);
    res.status(202).end();
  });

  routes.get("/auth/users", async (req, res) => {
    res.json(
      await auth.listUsers({
        role: req.query.role,
        limit: Number(req.query.limit ?? 20),
        cursor: req.query.cursor,
      }),
    );
  });

  routes.post("/auth/users", async (req, res) => {
    const { name, role, yaiId } = req.body;
    res
      .status(201)
      .json(
        await auth.createUser({ email: emailOf(req.body), name, role, yaiId }),
      );
  });

  routes.patch("/auth/users/:userId", async (req, res) => {
    const { name, role, yaiId, disabled } = req.body;
    res.json(
      await auth.updateUser(
        req.params.userId,
        { name, role, yaiId, disabled },
        req.user,
      ),
    );
  });

  // Who changed what, from every service.
  routes.get("/auth/audit-log", async (req, res) => {
    res.json(
      await auth.listAudit({
        service: req.query.service,
        actorId: req.query.actorId,
        limit: Number(req.query.limit ?? 20),
        cursor: req.query.cursor,
      }),
    );
  });

  // Events that failed 5 times, waiting in the dead-letter queue.
  const failedEvents = () => {
    if (!deadLetters) throw serviceUnavailable();
    return deadLetters;
  };
  routes.get("/auth/failed-events", async (req, res) => {
    res.json(
      await failedEvents().list({ limit: Number(req.query.limit ?? 50) }),
    );
  });
  routes.post("/auth/failed-events/:failedEventId/retry", async (req, res) => {
    res.json(await failedEvents().retry(req.params.failedEventId));
  });
  routes.delete("/auth/failed-events/:failedEventId", async (req, res) => {
    await failedEvents().discard(req.params.failedEventId);
    res.status(204).end();
  });

  // For notification, to email helpers and families.
  routes.get("/internal/auth/users", async (req, res) => {
    res.json(
      await auth.internalListUsers({
        role: req.query.role,
        yaiId: req.query.yaiId,
      }),
    );
  });
  routes.get("/internal/auth/users/:userId", async (req, res) => {
    res.json(await auth.internalGetUser(req.params.userId));
  });

  return routes;
}

/**
 * The auth service's Express app. The spec checks every request and the
 * role from `x-roles` before a route runs.
 */
export function createAuthApp({
  auth,
  verifyToken,
  internalToken,
  deadLetters,
  logger,
  ready,
  validateResponses = false,
}) {
  return createApp({
    service: "auth",
    logger,
    routes: authRoutes(auth, deadLetters),
    auth: { verifyToken, internalToken },
    ready,
    validateResponses,
    // Auth keeps the audit log, so its own entries go straight in.
    audit: (entry) => auth.recordAudit(entry),
  });
}
