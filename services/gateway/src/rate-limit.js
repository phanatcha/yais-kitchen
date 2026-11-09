import { tooManyRequests } from "@yais-kitchen/shared";

/**
 * Counts calls in fixed windows, in memory. That is enough for one gateway.
 * With more than one, the counts would need to move to a shared store.
 * At most `maxKeys` callers are remembered; the oldest window is forgotten
 * first, so a flood of new callers can't use up the memory.
 */
export function createRateLimiter({ now = Date.now, maxKeys = 100_000 } = {}) {
  const windows = new Map();

  return {
    /** Counts one call and says whether it is allowed. */
    hit(key, windowMs, max) {
      const time = now();
      let window = windows.get(key);
      if (!window || window.resetAt <= time) {
        windows.delete(key);
        if (windows.size >= maxKeys) {
          windows.delete(windows.keys().next().value);
        }
        window = { count: 0, resetAt: time + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= max,
        retryAfterSeconds: Math.ceil((window.resetAt - time) / 1000),
      };
    },
  };
}

// Who a limit counts against: `email` from the body, the signed-in `user`,
// or the caller's `ip`.
export const RATE_LIMIT_KEYS = ["email", "user", "ip"];

function caller(key, req) {
  if (key === "email" && typeof req.body?.email === "string") {
    return req.body.email.trim().toLowerCase();
  }
  if (key === "user" && req.user) return req.user.id;
  return req.ip;
}

/** An operation's `x-rate-limit`: one rule, or a list of them. */
export const rateLimitsOf = (operation) =>
  [operation?.["x-rate-limit"] ?? []].flat();

/**
 * Applies every `x-rate-limit` rule of the operation the request matched,
 * such as `{ windowSeconds: 900, max: 5, key: email }` on sign-in codes.
 * Over any limit, the caller gets 429 with `Retry-After`.
 */
export function limitFromSpec(limiter) {
  return function checkRateLimit(req, res, next) {
    const operation = req.openapi?.schema;
    let waitSeconds = 0;
    for (const rule of rateLimitsOf(operation)) {
      const { allowed, retryAfterSeconds } = limiter.hit(
        `${operation.operationId}:${rule.key}:${caller(rule.key, req)}`,
        rule.windowSeconds * 1000,
        rule.max,
      );
      if (!allowed) waitSeconds = Math.max(waitSeconds, retryAfterSeconds);
    }
    if (waitSeconds > 0) return next(tooManyRequests(waitSeconds));
    next();
  };
}
