import { logContext } from "@yais-kitchen/shared";

/**
 * Reads people from auth's internal API, so helpers and families can be
 * emailed. Their addresses are never copied into events.
 * @param {{ baseUrl: string, internalToken: string, timeoutMs?: number, fetch?: typeof fetch }} options
 */
export function createAuthClient({
  baseUrl,
  internalToken,
  timeoutMs = 5000,
  fetch = globalThis.fetch,
}) {
  async function get(path) {
    const requestId = logContext.getStore()?.requestId;
    const response = await fetch(new URL(path, baseUrl), {
      headers: {
        accept: "application/json",
        "x-internal-token": internalToken,
        ...(requestId && { "x-request-id": requestId }),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Auth answered ${response.status}.`);
    return response.json();
  }

  return {
    /**
     * @returns {Promise<{ id: string, email: string, name: string, role: string, disabled: boolean } | null>}
     *   Null if the account is gone. Throws if auth can't be reached, so the
     *   event is tried again.
     */
    getUser(userId) {
      return get(`/internal/auth/users/${encodeURIComponent(userId)}`);
    },

    /** The family accounts of one Yai that are turned on. */
    async familiesOf(yaiId) {
      const params = new URLSearchParams({ role: "family", yaiId });
      const body = await get(`/internal/auth/users?${params}`);
      return body?.items ?? [];
    },
  };
}
