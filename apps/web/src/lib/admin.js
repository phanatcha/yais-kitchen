// Data for the Admin pages: everything only Admin may do.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, withQuery } from "./api.js";

/** Lists are 50 at a time; `items` joins the pages loaded so far. */
function usePaged(key, path, params, { enabled = true } = {}) {
  const query = useInfiniteQuery({
    queryKey: [...key, params],
    queryFn: ({ signal, pageParam }) =>
      api(withQuery(path, { ...params, limit: 50, cursor: pageParam }), {
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

/** A mutation that refreshes every query under `prefix` when it succeeds. */
function useAdminMutation(prefix, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prefix }),
  });
}

// ---------- Applications ----------

export const STAGES = [
  ["received", "Received"],
  ["kitchen_visit", "Kitchen visit"],
  ["trial_class", "Trial class"],
  ["approved", "Approved"],
  ["declined", "Declined"],
];

/** The stage after this one, or null at the end (FR: received → approved). */
export function nextStage(stage) {
  const order = ["received", "kitchen_visit", "trial_class", "approved"];
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

/** GET /catalog/applications, newest first. */
export function useApplications(stage) {
  return usePaged(["catalog", "applications"], "/catalog/applications", {
    stage: stage || undefined,
  });
}

/**
 * One application. There is no GET for one, so this pages through the list
 * until it finds it.
 */
export function useApplication(applicationId) {
  return useQuery({
    queryKey: ["catalog", "applications", "one", applicationId],
    queryFn: async ({ signal }) => {
      let cursor;
      for (let page = 0; page < 40; page++) {
        const data = await api(
          withQuery("/catalog/applications", { limit: 50, cursor }),
          { signal },
        );
        const found = data.items.find((a) => a.id === applicationId);
        if (found) return found;
        if (!data.nextCursor) break;
        cursor = data.nextCursor;
      }
      return null;
    },
    enabled: Boolean(applicationId),
  });
}

/** PATCH /catalog/applications/{id}: `{ stage }` or `{ notes }`. */
export function useUpdateApplication(applicationId) {
  return useAdminMutation(["catalog", "applications"], (patch) =>
    api(`/catalog/applications/${applicationId}`, {
      method: "PATCH",
      body: patch,
    }),
  );
}

/** DELETE /catalog/applications/{id}: everything the family sent goes. */
export function useDeleteApplication(applicationId) {
  return useAdminMutation(["catalog", "applications"], () =>
    api(`/catalog/applications/${applicationId}`, { method: "DELETE" }),
  );
}

// ---------- Yais, classes and recipes ----------

/** GET /catalog/yais with hidden ones too. */
export function useAdminYais() {
  return usePaged(["catalog", "yais", "admin"], "/catalog/yais", {
    includeHidden: true,
  });
}

/** GET /catalog/classes for one Yai, hidden ones too. */
export function useAdminClasses(yaiId) {
  return usePaged(
    ["catalog", "classes", "admin"],
    "/catalog/classes",
    { yaiId, includeHidden: true },
    { enabled: Boolean(yaiId) },
  );
}

/** GET /catalog/classes, every Yai's, hidden ones too: for names in lists. */
export function useAllClasses() {
  return usePaged(["catalog", "classes", "admin", "all"], "/catalog/classes", {
    includeHidden: true,
  });
}

export function useCreateYai() {
  return useAdminMutation(["catalog"], (yai) =>
    api("/catalog/yais", { method: "POST", body: yai }),
  );
}

export function useUpdateYai(yaiId) {
  return useAdminMutation(["catalog"], (patch) =>
    api(`/catalog/yais/${yaiId}`, { method: "PATCH", body: patch }),
  );
}

export function useCreateClass() {
  return useAdminMutation(["catalog"], (classInfo) =>
    api("/catalog/classes", { method: "POST", body: classInfo }),
  );
}

export function useUpdateClass(classId) {
  return useAdminMutation(["catalog"], (patch) =>
    api(`/catalog/classes/${classId}`, { method: "PATCH", body: patch }),
  );
}

/** PUT /catalog/classes/{id}/recipe: the whole shopping list and steps. */
export function useSaveRecipe(classId) {
  return useAdminMutation(["catalog", "recipe", classId], (recipe) =>
    api(`/catalog/classes/${classId}/recipe`, { method: "PUT", body: recipe }),
  );
}

// ---------- Class times ----------

/** GET /catalog/class-times: every Yai's, from `from` on. */
export function useAdminClassTimes(params) {
  return usePaged(
    ["catalog", "class-times", "admin"],
    "/catalog/class-times",
    params,
  );
}

/** POST /catalog/class-times: a class in one of the Yai's available times. */
export function useCreateClassTime() {
  return useAdminMutation(["catalog"], (body) =>
    api("/catalog/class-times", { method: "POST", body }),
  );
}

/** PATCH /catalog/class-times/{id}: `{ helperId }` or `{ status: "cancelled" }`. */
export function useUpdateClassTime() {
  return useAdminMutation(["catalog"], ({ classTimeId, ...patch }) =>
    api(`/catalog/class-times/${classTimeId}`, {
      method: "PATCH",
      body: patch,
    }),
  );
}

// ---------- Accounts ----------

/** GET /auth/users, optionally one role. */
export function useUsers(role) {
  return usePaged(["auth", "users"], "/auth/users", {
    role: role || undefined,
  });
}

/** POST /auth/users: a family (with `yaiId`), helper or admin account. */
export function useCreateUser() {
  return useAdminMutation(["auth", "users"], (user) =>
    api("/auth/users", { method: "POST", body: user }),
  );
}

/**
 * PATCH /auth/users/{id}: `{ name }`, `{ role, yaiId? }` or
 * `{ disabled }`. A new role or a turned-off account signs the person out.
 */
export function useUpdateUser() {
  return useAdminMutation(["auth", "users"], ({ id, ...patch }) =>
    api(`/auth/users/${id}`, { method: "PATCH", body: patch }),
  );
}

// ---------- Activity and failed events ----------

/** GET /auth/audit-log, newest first, optionally one service. */
export function useAuditLog(service) {
  return usePaged(["auth", "audit-log"], "/auth/audit-log", {
    service: service || undefined,
  });
}

/** GET /auth/failed-events: what is waiting in the dead-letter queue. */
export function useFailedEvents() {
  return useQuery({
    queryKey: ["auth", "failed-events"],
    queryFn: ({ signal }) =>
      api(withQuery("/auth/failed-events", { limit: 200 }), { signal }),
  });
}

/** POST /auth/failed-events/{id}/retry */
export function useRetryFailedEvent() {
  return useAdminMutation(["auth", "failed-events"], (id) =>
    api(`/auth/failed-events/${id}/retry`, { method: "POST" }),
  );
}

/** DELETE /auth/failed-events/{id} */
export function useDiscardFailedEvent() {
  return useAdminMutation(["auth", "failed-events"], (id) =>
    api(`/auth/failed-events/${id}`, { method: "DELETE" }),
  );
}

// ---------- FAQ ----------

/** PUT /catalog/faq: every group at once. */
export function useSaveFaq() {
  return useAdminMutation(["catalog", "faq"], (faq) =>
    api("/catalog/faq", { method: "PUT", body: faq }),
  );
}

// ---------- Money and ratings ----------

export function useAdminPayouts(yaiId) {
  return usePaged(
    ["booking", "payouts", "admin"],
    "/booking/payouts",
    { yaiId },
    { enabled: Boolean(yaiId) },
  );
}

/** POST /booking/payouts: one batch for a Yai and a period of dates. */
export function useCreatePayout() {
  return useAdminMutation(["booking"], (body) =>
    api("/booking/payouts", { method: "POST", body }),
  );
}

/** POST /booking/payouts/{id}/mark-paid with the PromptPay reference. */
export function useMarkPaid() {
  return useAdminMutation(["booking"], ({ payoutId, reference }) =>
    api(`/booking/payouts/${payoutId}/mark-paid`, {
      method: "POST",
      body: { reference },
    }),
  );
}

export function usePayments() {
  return usePaged(["payment", "payments"], "/payment/payments", {});
}

export function useRefunds() {
  return usePaged(["payment", "refunds"], "/payment/refunds", {});
}

export function useRatings(yaiId) {
  return usePaged(["booking", "ratings"], "/booking/ratings", {
    yaiId: yaiId || undefined,
  });
}
