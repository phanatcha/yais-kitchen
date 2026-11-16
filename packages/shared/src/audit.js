// Who changed what. Every change a staff member makes through the API (a
// POST, PUT, PATCH or DELETE that worked) becomes one audit entry. Tourists'
// own bookings aren't entries: they are already the service's records.

const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STAFF = new Set(["admin", "helper", "family"]);

// Never kept, even for an admin: sign-in codes, tokens and card details.
const SECRET = /code|token|secret|password|card|cvc/i;
const MAX_STRING = 300;
const MAX_ITEMS = 20;
const MAX_DEPTH = 4;
const MAX_JSON = 4000;

/** A copy of a request body that is safe and small enough to keep. */
export function redact(value, depth = 0) {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ITEMS)
      items.push(`…${value.length - MAX_ITEMS} more`);
    return items;
  }
  const copy = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[key] = SECRET.test(key) ? "[hidden]" : redact(inner, depth + 1);
  }
  return copy;
}

/** What the change was, kept under 4 KB. A bigger body keeps its field names. */
function changesOf(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const changes = redact(body);
  if (JSON.stringify(changes).length <= MAX_JSON) return changes;
  return { fields: Object.keys(body).slice(0, 50) };
}

/**
 * The audit entry for a finished request, or null when it changed nothing a
 * staff member did. Path parameters name what was changed.
 */
export function auditEntry(req, res, service, now = new Date()) {
  if (!CHANGES.has(req.method)) return null;
  if (res.statusCode >= 400) return null;
  const user = req.user;
  if (!user || !STAFF.has(user.role)) return null;
  const operation = req.openapi?.schema;
  // Joining a class, captions and the like happen many times a class.
  if (operation?.["x-audit"] === false) return null;
  return {
    service,
    action: operation?.operationId ?? `${req.method} ${req.route?.path ?? ""}`,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    target: { ...(req.openapi?.pathParams ?? {}) },
    status: res.statusCode,
    actor: {
      id: user.id,
      role: user.role,
      ...(user.name && { name: user.name }),
      ...(user.email && { email: user.email }),
    },
    changes: changesOf(req.body),
    ...(req.id && { requestId: req.id }),
    at: now.toISOString(),
  };
}

/**
 * Express middleware that hands each audit entry to `record` once the
 * response has gone out. Recording never slows down or fails the request.
 * A service records through its outbox, so an entry survives the event
 * broker being down.
 * @param {{ service: string, record: (entry: object) => Promise<unknown>, logger: import("pino").Logger }} options
 */
export function auditTrail({ service, record, logger }) {
  return function recordChanges(req, res, next) {
    res.on("finish", () => {
      const entry = auditEntry(req, res, service);
      if (!entry) return;
      Promise.resolve()
        .then(() => record(entry))
        .catch((error) =>
          logger.error(
            { err: error, action: entry.action },
            "could not record who made this change",
          ),
        );
    });
    next();
  };
}
