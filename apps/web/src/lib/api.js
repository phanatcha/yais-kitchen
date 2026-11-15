const BASE_URL = import.meta.env.VITE_API_URL;

let accessToken = null;

/** Called after POST /auth/sessions or POST /auth/guest-sessions succeeds. */
export function setAccessToken(token) {
  accessToken = token;
}

/** True once someone has signed in or started a guest checkout in this tab. */
export function hasAccessToken() {
  return accessToken !== null;
}

export class ApiError extends Error {
  constructor(status, body) {
    // Every error body has the `Error` shape: { error: { code, message, ... } }.
    super(body?.error?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? null;
    this.body = body;
  }
}

/**
 * Adds query parameters to a path, skipping empty values.
 * withQuery("/booking/bookings", { when: "upcoming" }) → "/booking/bookings?when=upcoming"
 */
export function withQuery(path, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** A new key for each attempt, for operations that take `Idempotency-Key`. */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Calls the API and returns the parsed JSON body.
 * @param {string} path e.g. "/booking/bookings"
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, headers?: Record<string, string> }} [options]
 */
export async function api(
  path,
  { method = "GET", body, signal, headers: extraHeaders } = {},
) {
  const headers = { Accept: "application/json", ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // TODO when switching to the real gateway: add credentials: "include"
  // so the httpOnly refresh-token cookie is sent.
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
