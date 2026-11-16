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

let refreshing = null;

/**
 * POST /auth/sessions/refresh: swaps the httpOnly refresh cookie for a new
 * access token. Calls made at the same moment share one refresh, because the
 * refresh token rotates on every use. Resolves to true if it worked.
 */
export function refreshSession() {
  refreshing ??= fetch(`${BASE_URL}/auth/sessions/refresh`, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const session = await res.json();
      accessToken = session.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// These answer 401 for a wrong code or a missing cookie, not an old token.
const NO_REFRESH = ["/auth/codes", "/auth/sessions", "/auth/guest-sessions"];

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
  // URLSearchParams writes spaces as "+", which the API's spec check refuses.
  // A real "+" is already "%2B", so this only changes spaces.
  const qs = search.toString().replaceAll("+", "%20");
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
  // A reload loses the token, so wait for the refresh that main.jsx starts.
  if (refreshing) await refreshing;

  const send = () => {
    const headers = { Accept: "application/json", ...extraHeaders };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    // credentials sends the httpOnly refresh cookie to sign in and sign out.
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();
  // The access token lasts 15 minutes. Refresh it once and try again.
  if (
    res.status === 401 &&
    !NO_REFRESH.some((p) => path.startsWith(p)) &&
    (await refreshSession())
  ) {
    res = await send();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
