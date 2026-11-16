import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.js";

export const liveStateKey = (classTimeId) => ["live", "state", classTimeId];

/**
 * GET /live/class-times/{classTimeId}/state: current recipe step and recording.
 * In the call, changes also arrive as LiveKit data messages (see liveCall.js),
 * which refetch this at once. Tourists poll every 5 seconds as well, in case a
 * message is missed.
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
 * POST /live/class-times/{classTimeId}/join: a LiveKit ticket that works for
 * 2 minutes, so it is asked for right before connecting.
 */
export function requestJoinTicket(classTimeId) {
  return api(`/live/class-times/${classTimeId}/join`, { method: "POST" });
}

/**
 * Where the browser reaches LiveKit. In the network demo the web app's own
 * address passes the signalling through (see vite.config.js); otherwise it
 * is the address live-class gives in the ticket.
 */
export function liveKitUrl(ticket) {
  if (import.meta.env.VITE_LIVEKIT_THROUGH_SITE === "true") {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}`;
  }
  return ticket.serverUrl;
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
