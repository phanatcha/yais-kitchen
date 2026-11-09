// Every error a service sends uses the spec's `Error` shape:
// { error: { code, message, requestId, retryable, details? } }
// `message` is shown to the user, so it is plain English and never contains
// internals. Stack traces and the messages of unexpected errors only go to
// the logs.

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {{ details?: { field: string, message: string }[], retryable?: boolean, headers?: Record<string, string>, cause?: unknown }} [options]
   */
  constructor(status, code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? (status >= 500 || status === 429);
    this.headers = options.headers;
  }
}

export const badRequest = (message = "Some fields are wrong.", details) =>
  new HttpError(400, "validation_failed", message, { details });

export const unauthorized = (message = "Please sign in again.") =>
  new HttpError(401, "unauthorized", message);

export const forbidden = (message = "You can't do that.") =>
  new HttpError(403, "forbidden", message);

export const notFound = (message = "We couldn't find that.") =>
  new HttpError(404, "not_found", message);

/** @param {string} code Why it can't happen, such as `not_enough_seats`. */
export const conflict = (code, message) => new HttpError(409, code, message);

export const tooManyRequests = (
  retryAfterSeconds,
  message = "Too many tries. Please wait a few minutes.",
) =>
  new HttpError(429, "rate_limited", message, {
    headers: { "Retry-After": String(retryAfterSeconds) },
  });

export const serviceUnavailable = (
  message = "This isn't working right now. Please try again in a minute.",
) => new HttpError(503, "service_unavailable", message);

const internalError = () =>
  new HttpError(
    500,
    "internal_error",
    "Something went wrong on our side. Please try again.",
  );

// Errors from express.json().
const BODY_ERRORS = {
  "entity.too.large": () =>
    new HttpError(
      413,
      "payload_too_large",
      "That is too much to send at once.",
    ),
  "entity.parse.failed": () =>
    new HttpError(400, "invalid_json", "The request body isn't valid JSON."),
  "encoding.unsupported": () =>
    new HttpError(415, "unsupported_media_type", "Send the body as JSON."),
  "charset.unsupported": () =>
    new HttpError(415, "unsupported_media_type", "Send the body as JSON."),
  "request.aborted": () =>
    new HttpError(400, "request_aborted", "The request was cut off."),
};

// Errors from the spec validator. Its 5xx errors (a response that doesn't
// match the spec) stay internal errors.
const SPEC_ERRORS = {
  400: (error) => badRequest(undefined, error.errors.map(toDetail)),
  404: () => notFound(),
  405: () =>
    new HttpError(405, "method_not_allowed", "That isn't allowed here."),
  413: BODY_ERRORS["entity.too.large"],
  415: BODY_ERRORS["encoding.unsupported"],
};

// "/body/guests/0/name" → "guests.0.name", "/query/limit" → "limit"
function toDetail({ path = "", message }) {
  const [where, ...rest] = path.split("/").filter(Boolean);
  return { field: rest.join(".") || where || "body", message };
}

/** Turns anything thrown into an HttpError the client may see. */
export function toHttpError(error) {
  if (error instanceof HttpError) return error;
  if (BODY_ERRORS[error?.type]) return BODY_ERRORS[error.type]();
  if (Array.isArray(error?.errors) && SPEC_ERRORS[error.status]) {
    return SPEC_ERRORS[error.status](error);
  }
  return internalError();
}

/** @param {import("pino").Logger} logger */
export function errorHandler(logger) {
  return function handleError(error, req, res, next) {
    if (res.headersSent) return next(error);

    const httpError = toHttpError(error);
    if (httpError.status >= 500) {
      logger.error({ err: error, requestId: req.id }, "request failed");
    }

    res.locals.errorCode = httpError.code;
    if (httpError.headers) res.set(httpError.headers);
    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId: req.id ?? "unknown",
        retryable: httpError.retryable,
        ...(httpError.details && { details: httpError.details }),
      },
    });
  };
}
