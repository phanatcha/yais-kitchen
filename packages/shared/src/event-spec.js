import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";

// ajv-formats is CommonJS, so its default export arrives wrapped.
const addFormats = addFormatsModule.default ?? addFormatsModule;

export const EVENT_SPEC_PATH = fileURLToPath(
  import.meta.resolve("@yais-kitchen/api-spec/asyncapi.yaml"),
);

/** Reads asyncapi.yaml. */
export function loadEventSpec(path = EVENT_SPEC_PATH) {
  return parse(readFileSync(path, "utf8"));
}

/**
 * An event that doesn't match asyncapi.yaml. Trying again can't fix it, so
 * `retryable` is false and the event goes straight to the dead-letter queue.
 */
export class EventSpecError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "EventSpecError";
    this.details = details;
    this.retryable = false;
  }
}

/**
 * Returns a function that checks a whole event (envelope and `data`) against
 * its message in asyncapi.yaml and throws an EventSpecError if it doesn't
 * match. Messages name the field and the rule, never the value, so a
 * sign-in code can't end up in a log.
 * @param {object} [spec] From loadEventSpec.
 */
export function createEventChecker(spec = loadEventSpec()) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(spec, "asyncapi");

  const checks = new Map();
  for (const [key, message] of Object.entries(
    spec.components?.messages ?? {},
  )) {
    checks.set(
      message.name,
      ajv.compile({ $ref: `asyncapi#/components/messages/${key}/payload` }),
    );
  }

  function checkEvent(event) {
    const check = checks.get(event?.type);
    if (!check) {
      throw new EventSpecError(
        `"${event?.type}" isn't an event in asyncapi.yaml.`,
      );
    }
    if (check(event)) return;
    const details = check.errors.map((error) => ({
      field: error.instancePath.slice(1).replaceAll("/", ".") || "event",
      message: error.message,
    }));
    const summary = details
      .map((detail) => `${detail.field} ${detail.message}`)
      .join("; ");
    throw new EventSpecError(
      `The ${event.type} event doesn't match asyncapi.yaml: ${summary}`,
      details,
    );
  }

  /** True if asyncapi.yaml has this event type. */
  checkEvent.knows = (type) => checks.has(type);
  return checkEvent;
}
