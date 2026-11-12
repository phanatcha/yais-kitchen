const BASE_URL = import.meta.env.VITE_API_URL;

let accessToken = null;

/** Called by Sign In after POST /auth/sessions succeeds. */
export function setAccessToken(token) {
  accessToken = token;
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
 * Calls the API and returns the parsed JSON body.
 * @param {string} path e.g. "/booking/bookings"
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 */
export async function api(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
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
