import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, newIdempotencyKey, setAccessToken, withQuery } from "./api.js";
import { saveCheckout } from "./checkout.js";

// ---------------------------------------------------------------- catalog

/** GET /catalog/classes/{classId} */
export function useClass(classId) {
  return useQuery({
    queryKey: ["catalog", "class", classId],
    queryFn: ({ signal }) => api(`/catalog/classes/${classId}`, { signal }),
    enabled: Boolean(classId),
  });
}

/** GET /catalog/classes/{classId}/recipe: shopping list and recipe card. */
export function useRecipe(classId) {
  return useQuery({
    queryKey: ["catalog", "recipe", classId],
    queryFn: ({ signal }) =>
      api(`/catalog/classes/${classId}/recipe`, { signal }),
    enabled: Boolean(classId),
  });
}

// ---------------------------------------------------------------- book

/** GET /booking/class-times?classId=: published times with seats left. */
export function useBookableTimes(classId) {
  return useQuery({
    queryKey: ["booking", "class-times", classId],
    queryFn: ({ signal }) =>
      api(withQuery("/booking/class-times", { classId }), { signal }),
    enabled: Boolean(classId),
  });
}

/** POST /booking/holds: holds seats for 10 minutes. */
export function useCreateHold() {
  return useMutation({
    mutationFn: ({ classTimeId, guests }) =>
      api("/booking/holds", {
        method: "POST",
        body: { classTimeId, guests },
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
  });
}

/** DELETE /booking/holds/{holdId}: gives the seats back. */
export function useReleaseHold() {
  return useMutation({
    mutationFn: (holdId) =>
      api(`/booking/holds/${holdId}`, { method: "DELETE" }),
  });
}

/**
 * POST /auth/guest-sessions: a 30-minute token for checkout without signing
 * in. It has no refresh cookie, so it is kept with the checkout in this tab
 * (like the hold ID) to survive a reload until it expires.
 */
export function useStartGuestSession() {
  return useMutation({
    mutationFn: ({ email, name }) =>
      api("/auth/guest-sessions", { method: "POST", body: { email, name } }),
    onSuccess: (session) => {
      setAccessToken(session.accessToken);
      saveCheckout({
        guestToken: session.accessToken,
        guestTokenExpiresAt: Date.now() + session.expiresIn * 1000,
      });
    },
  });
}

/**
 * POST /booking/bookings: turns the hold into a booking waiting for payment.
 * language, allergies and cookingExperience brief the helper.
 */
export function useCreateBooking() {
  return useMutation({
    mutationFn: ({ holdId, language, allergies, cookingExperience }) =>
      api("/booking/bookings", {
        method: "POST",
        body: { holdId, language, allergies, cookingExperience },
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
  });
}

/** POST /payment/intents: returns the Stripe client secret. */
export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: ({ bookingId, method }) =>
      api("/payment/intents", {
        method: "POST",
        body: { bookingId, method },
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
  });
}

// ---------------------------------------------------------------- bookings

export const bookingKey = (bookingId) => ["booking", "booking", bookingId];

/**
 * GET /booking/bookings/{bookingId}
 * @param {{ pollWhilePending?: boolean }} [options] Booking Confirmed polls
 *   every 2 seconds, up to 15 times, until payment confirms it.
 */
export function useBooking(bookingId, { pollWhilePending = false } = {}) {
  return useQuery({
    queryKey: bookingKey(bookingId),
    queryFn: ({ signal }) => api(`/booking/bookings/${bookingId}`, { signal }),
    enabled: Boolean(bookingId),
    refetchInterval: (query) =>
      pollWhilePending &&
      query.state.data?.status === "pending_payment" &&
      query.state.dataUpdateCount < 15
        ? 2000
        : false,
  });
}

/**
 * GET /booking/bookings, a page at a time: My Classes (tourist), a Yai's
 * bookings (family) or one class time's (helper). `items` joins the pages
 * loaded so far; `fetchNextPage` loads the next while `hasNextPage`.
 */
export function useBookingPages(params = {}, { enabled = true } = {}) {
  const query = useInfiniteQuery({
    queryKey: ["booking", "bookings", params],
    queryFn: ({ signal, pageParam }) =>
      api(withQuery("/booking/bookings", { ...params, cursor: pageParam }), {
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

/** POST /booking/bookings/{bookingId}/cancel: full refund up to 48 h before. */
export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId) =>
      api(`/booking/bookings/${bookingId}/cancel`, { method: "POST" }),
    onSuccess: (booking) => {
      queryClient.setQueryData(bookingKey(booking.id), booking);
      queryClient.invalidateQueries({ queryKey: ["booking", "bookings"] });
    },
  });
}

/**
 * PUT /booking/bookings/{bookingId}/checklist: saves shopping list ticks.
 * The tick shows at once and rolls back if saving fails. On success the cache
 * keeps what was sent, which is what the server stores.
 */
export function useUpdateChecklist(bookingId) {
  const queryClient = useQueryClient();
  const key = bookingKey(bookingId);
  return useMutation({
    mutationFn: (checkedIngredientIds) =>
      api(`/booking/bookings/${bookingId}/checklist`, {
        method: "PUT",
        body: { checkedIngredientIds },
      }),
    onMutate: async (checkedIngredientIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (b) => b && { ...b, checkedIngredientIds });
      return { previous };
    },
    onError: (_error, _ids, context) =>
      queryClient.setQueryData(key, context?.previous),
  });
}

/** GET /live/class-times/{classTimeId}/recording: a one-hour private link. */
export function useRecordingLink() {
  return useMutation({
    mutationFn: (classTimeId) =>
      api(`/live/class-times/${classTimeId}/recording`),
  });
}

/** POST /booking/bookings/{bookingId}/rating: once per booking. */
export function useRateBooking(bookingId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rating) =>
      api(`/booking/bookings/${bookingId}/rating`, {
        method: "POST",
        body: rating,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: bookingKey(bookingId) }),
  });
}
