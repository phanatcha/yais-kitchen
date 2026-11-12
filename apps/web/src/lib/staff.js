// Data for helpers and Yai's families (FR-32 to FR-36).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, withQuery } from "./api.js";

/**
 * GET /catalog/class-times: a helper sees the ones assigned to them, a family
 * sees their own Yai's. Starts from now unless `from` is given.
 */
export function useClassTimes(params = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["catalog", "class-times", params],
    queryFn: ({ signal }) =>
      api(withQuery("/catalog/class-times", params), { signal }),
    enabled,
  });
}

const availableKey = (yaiId) => ["catalog", "available-times", yaiId];

/** GET /catalog/yais/{yaiId}/available-times (FR-34) */
export function useAvailableTimes(yaiId) {
  return useQuery({
    queryKey: availableKey(yaiId),
    queryFn: ({ signal }) =>
      api(`/catalog/yais/${yaiId}/available-times`, { signal }),
    enabled: Boolean(yaiId),
  });
}

/** POST /catalog/yais/{yaiId}/available-times: 409 `time_overlaps` if it clashes. */
export function useAddAvailableTime(yaiId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ startsAt, endsAt }) =>
      api(`/catalog/yais/${yaiId}/available-times`, {
        method: "POST",
        body: { startsAt, endsAt },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: availableKey(yaiId) }),
  });
}

/** DELETE /catalog/yais/{yaiId}/available-times/{id}: 409 `time_in_use` once used. */
export function useDeleteAvailableTime(yaiId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (availableTimeId) =>
      api(`/catalog/yais/${yaiId}/available-times/${availableTimeId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: availableKey(yaiId) }),
  });
}

/** GET /booking/earnings (FR-36): the Yai's 75% share, by month or by class. */
export function useEarnings(yaiId, groupBy) {
  return useQuery({
    queryKey: ["booking", "earnings", yaiId, groupBy],
    queryFn: ({ signal }) =>
      api(withQuery("/booking/earnings", { yaiId, groupBy }), { signal }),
    enabled: Boolean(yaiId),
  });
}

/** GET /booking/payouts (FR-36): weekly PromptPay payouts. */
export function usePayouts(yaiId) {
  return useQuery({
    queryKey: ["booking", "payouts", yaiId],
    queryFn: ({ signal }) =>
      api(withQuery("/booking/payouts", { yaiId }), { signal }),
    enabled: Boolean(yaiId),
  });
}
