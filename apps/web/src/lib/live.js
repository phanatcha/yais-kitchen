import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.js";

export const liveStateKey = (classTimeId) => ["live", "state", classTimeId];

/**
 * GET /live/class-times/{classTimeId}/state: current recipe step and recording.
 * In the real call, changes arrive as LiveKit data messages. Until LiveKit is
 * wired in, tourists poll every 5 seconds instead.
 */
export function useLiveState(classTimeId, { poll = true } = {}) {
  return useQuery({
    queryKey: liveStateKey(classTimeId),
    queryFn: ({ signal }) =>
      api(`/live/class-times/${classTimeId}/state`, { signal }),
    enabled: Boolean(classTimeId),
    refetchInterval: poll ? 5000 : false,
  });
}

/**
 * POST /live/class-times/{classTimeId}/join: the LiveKit ticket. Not used yet
 * (the video is a placeholder), but it checks that this person may join.
 */
export function useJoinTicket(classTimeId) {
  return useQuery({
    queryKey: ["live", "join", classTimeId],
    queryFn: () =>
      api(`/live/class-times/${classTimeId}/join`, { method: "POST" }),
    enabled: Boolean(classTimeId),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * PUT /live/class-times/{classTimeId}/step (helper only). The new step shows
 * at once and rolls back if the call fails. The server stores the index it
 * was sent, so the cache keeps it on success.
 */
export function useSetStep(classTimeId) {
  const queryClient = useQueryClient();
  const key = liveStateKey(classTimeId);
  return useMutation({
    mutationFn: (index) =>
      api(`/live/class-times/${classTimeId}/step`, {
        method: "PUT",
        body: { index },
      }),
    onMutate: async (index) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(
        key,
        (s) => s && { ...s, step: { ...s.step, index } },
      );
      return { previous };
    },
    onError: (_error, _index, context) =>
      queryClient.setQueryData(key, context?.previous),
  });
}

/** POST /live/class-times/{classTimeId}/end (helper or admin): ends it for everyone. */
export function useEndClass(classTimeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/live/class-times/${classTimeId}/end`, { method: "POST" }),
    onSuccess: (state) =>
      queryClient.setQueryData(liveStateKey(classTimeId), state),
  });
}
