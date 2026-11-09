import { logContext } from "@yais-kitchen/shared";

/**
 * Reads a class time from catalog's internal API, for the Thai dish name
 * and the shopping list in the booking email.
 * @param {{ baseUrl: string, internalToken: string, timeoutMs?: number, fetch?: typeof fetch }} options
 */
export function createCatalogClient({
  baseUrl,
  internalToken,
  timeoutMs = 5000,
  fetch = globalThis.fetch,
}) {
  return {
    /**
     * @returns {Promise<{ dishThai?: string, ingredients: object[] } | null>}
     *   Null if catalog doesn't know the class time. Throws if catalog can't
     *   be reached, so the event is tried again.
     */
    async getClassTime(classTimeId) {
      const url = new URL(
        `/internal/catalog/class-times/${encodeURIComponent(classTimeId)}`,
        baseUrl,
      );
      const requestId = logContext.getStore()?.requestId;
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "x-internal-token": internalToken,
          ...(requestId && { "x-request-id": requestId }),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Catalog answered ${response.status}.`);
      }
      const body = await response.json();
      return {
        dishThai: body.class?.dishThai,
        ingredients: (body.ingredients ?? []).map(
          ({ name, nameThai, quantity }) => ({ name, nameThai, quantity }),
        ),
      };
    },
  };
}
