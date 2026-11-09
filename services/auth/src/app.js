import { createApp, unauthorized } from "@yais-kitchen/shared";
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

/** @param {ReturnType<typeof import("./auth.js").createAuth>} auth */
export function authRoutes(auth) {
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

  return routes;
}

/**
 * The auth service's Express app. The spec checks every request and the
 * role from `x-roles` before a route runs.
 */
export function createAuthApp({
  auth,
  verifyToken,
  logger,
  ready,
  validateResponses = false,
}) {
  return createApp({
    service: "auth",
    logger,
    routes: authRoutes(auth),
    auth: { verifyToken },
    ready,
    validateResponses,
  });
}
