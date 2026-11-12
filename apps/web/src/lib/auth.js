import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "./api.js";

export const meQueryKey = ["auth", "me"];

/** POST /auth/codes: emails a 6-digit code. Always 202, even for unknown emails. */
export function useRequestCode() {
  return useMutation({
    mutationFn: (email) =>
      api("/auth/codes", { method: "POST", body: { email } }),
  });
}

/** POST /auth/sessions: swaps the emailed code for an access token. */
export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, code }) =>
      api("/auth/sessions", { method: "POST", body: { email, code } }),
    onSuccess: (session) => {
      setAccessToken(session.accessToken);
      queryClient.setQueryData(meQueryKey, session.user);
    },
  });
}

/**
 * DELETE /auth/sessions/current: ends the session and clears the refresh
 * cookie. The token and cached data are dropped even if the call fails.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/sessions/current", { method: "DELETE" }),
    onSettled: () => {
      setAccessToken(null);
      queryClient.clear();
    },
  });
}

/** GET /auth/me: the signed-in user. Pass `enabled: false` while signed out. */
export function useMe({ enabled = true } = {}) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => api("/auth/me", { signal }),
    enabled,
  });
}
