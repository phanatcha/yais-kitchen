import { createHash, timingSafeEqual } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { forbidden, notFound, unauthorized } from "./errors.js";

export const ROLES = Object.freeze([
  "guest",
  "tourist",
  "family",
  "helper",
  "admin",
]);

// Auth signs tokens with its Ed25519 private key. Every service checks them
// with the public key, so a token from anywhere else is rejected.
export const TOKEN = Object.freeze({
  algorithm: "EdDSA",
  issuer: "yais-kitchen-auth",
  audience: "yais-kitchen",
});

/**
 * @typedef {{ id: string, role: string, email?: string, name?: string, yaiId?: string, sessionId?: string }} User
 * `sessionId` is the `sid` of a guest token: one guest checkout.
 */

/**
 * Returns a function that checks a token and gives back who it belongs to.
 * It throws if the token is expired, signed by another key or has wrong claims.
 * @param {string} publicKeyPem
 * @returns {Promise<(token: string) => Promise<User>>}
 */
export async function createTokenVerifier(publicKeyPem) {
  const key = await importSPKI(publicKeyPem, TOKEN.algorithm);

  return async function verifyToken(token) {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [TOKEN.algorithm],
      issuer: TOKEN.issuer,
      audience: TOKEN.audience,
      requiredClaims: ["sub", "exp", "role"],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== "string" || !ROLES.includes(payload.role)) {
      throw new Error("The token's claims are wrong.");
    }
    return {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      name: payload.name,
      yaiId: payload.yaiId,
      sessionId: payload.sid,
    };
  };
}

/**
 * Lets a request through only with a valid `Authorization: Bearer` token,
 * and puts the person on `req.user`.
 * @param {(token: string) => Promise<User>} verifyToken
 */
export function requireAuth(verifyToken) {
  return async function checkToken(req, res, next) {
    const token = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
    if (!token) return next(unauthorized());
    try {
      req.user = await verifyToken(token);
    } catch {
      return next(unauthorized());
    }
    next();
  };
}

/**
 * Lets a request through only if `req.user` has one of these roles. Put it
 * after `requireAuth`.
 * @param {...string} roles
 */
export function requireRole(...roles) {
  const unknown = roles.filter((role) => !ROLES.includes(role));
  if (unknown.length > 0) throw new TypeError(`Unknown roles: ${unknown}`);

  return function checkRole(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

const digest = (value) => createHash("sha256").update(value).digest();

/**
 * Lets a call between services through only with the right
 * `X-Internal-Token`. The web app never has this token.
 * @param {string} secret
 */
export function requireInternalToken(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new TypeError("The internal token must be at least 32 characters.");
  }
  const expected = digest(secret);

  return function checkInternalToken(req, res, next) {
    const given = req.get("x-internal-token");
    if (!given || !timingSafeEqual(digest(given), expected)) {
      return next(unauthorized());
    }
    next();
  };
}

/**
 * Applies the spec's rules to every request the spec validator matched:
 * - `security: []` is public.
 * - `security: [{}, { bearerAuth: [] }]` is public, but a token is checked
 *   if one is sent, so the route can see `req.user` (an admin, say).
 * - `internalToken` needs the internal token.
 * - `refreshCookie` is let through, because auth checks that cookie itself.
 * - `bearerAuth` needs a token whose role is in the operation's `x-roles`.
 * A service never has to remember a check, and the spec stays the one place
 * that says who may call what.
 * @param {{ verifyToken?: (token: string) => Promise<User>, internalToken?: string }} options
 */
export function authorizeFromSpec({ verifyToken, internalToken } = {}) {
  const deny = (req, res, next) => next(unauthorized());
  const checkToken = verifyToken ? requireAuth(verifyToken) : deny;
  const checkInternal = internalToken
    ? requireInternalToken(internalToken)
    : deny;

  return function checkSpecRules(req, res, next) {
    // The validator leaves alone paths outside the spec's base path (the
    // gateway's `/api`). Those are refused, never let through unchecked.
    const operation = req.openapi?.schema;
    if (!operation) return next(notFound());

    const security = operation.security ?? [];
    const uses = (scheme) => security.some((rule) => scheme in rule);
    if (security.length === 0) return next();
    if (security.some((rule) => Object.keys(rule).length === 0)) {
      const sentToken = uses("bearerAuth") && req.get("authorization");
      return sentToken ? checkToken(req, res, next) : next();
    }
    if (uses("internalToken")) return checkInternal(req, res, next);
    if (uses("refreshCookie")) return next();

    const checkRole = requireRole(...(operation["x-roles"] ?? []));
    checkToken(req, res, (error) => {
      if (error) return next(error);
      checkRole(req, res, next);
    });
  };
}
