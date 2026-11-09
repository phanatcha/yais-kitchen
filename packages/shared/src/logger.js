import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

// Holds the request ID (or event ID) of the work in progress. Every log line
// written while that work runs gets these fields added, so code never has to
// pass a logger or an ID around.
export const logContext = new AsyncLocalStorage();

// Fields that hold secrets. `data.code` is the sign-in code in
// `auth.code_requested`, which works like a password for 10 minutes.
const SECRET_FIELDS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "headers.authorization",
  "headers.cookie",
  'headers["x-internal-token"]',
  "data.code",
  "event.data.code",
];

/**
 * @param {{ service: string, level?: string, destination?: import("pino").DestinationStream }} options
 */
export function createLogger({ service, level = "info", destination }) {
  return pino(
    {
      level,
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      // A copy, because pino merges the fields of each call into this object.
      mixin: () => ({ ...logContext.getStore() }),
      redact: { paths: SECRET_FIELDS, censor: "[hidden]" },
    },
    destination,
  );
}
