import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { api, withQuery } from "./api.js";

/** FAQ groups in page order, with their headings. */
export const FAQ_GROUPS = [
  ["booking", "Booking"],
  ["before_class", "Before class"],
  ["during_class", "During class"],
  ["after_class", "After class"],
  ["becoming_a_yai", "Becoming a Yai"],
];

/** "before_class" → "before-class", for anchors such as /help#before-class. */
export const faqAnchor = (groupId) => groupId.replaceAll("_", "-");

/** GET /catalog/faq: the questions, in groups. */
export function useFaq() {
  return useQuery({
    queryKey: ["catalog", "faq"],
    queryFn: ({ signal }) => api("/catalog/faq", { signal }),
  });
}

/** POST /catalog/applications: a family signs their Yai up. */
export function useApply() {
  return useMutation({
    mutationFn: (application) =>
      api("/catalog/applications", { method: "POST", body: application }),
  });
}

/** Regions a Yai can live in, for the sign-up form. */
export const REGION_OPTIONS = [
  ["north", "Northern Thailand"],
  ["northeast", "Isan (the northeast)"],
  ["central", "Central Thailand"],
  ["east", "Eastern Thailand"],
  ["west", "Western Thailand"],
  ["south", "Southern Thailand"],
];

/** Region filters on Browse Yais, in the Figma order. */
export const REGION_FILTERS = [
  { value: "", label: "All of Thailand" },
  { value: "north", label: "Northern" },
  { value: "central", label: "Central" },
  { value: "south", label: "Southern" },
  { value: "northeast", label: "Isan" },
];

const REGION_NAMES = {
  north: "Northern Thai",
  northeast: "Isan",
  central: "Central Thai",
  east: "Eastern Thai",
  west: "Western Thai",
  south: "Southern Thai",
};

/** "north" → "Northern Thai recipes", "northeast" → "Isan recipes" */
export function regionRecipes(region) {
  return `${REGION_NAMES[region] ?? "Thai"} recipes`;
}

/** "north" → "A northern Thai family recipe", "northeast" → "An Isan family recipe" */
export function regionFamilyRecipe(region) {
  if (region === "northeast") return "An Isan family recipe";
  // "Northern Thai" → "northern Thai": only the first word goes lower case.
  const name = (REGION_NAMES[region] ?? "Thai").replace(/^\w+(?= )/, (word) =>
    word.toLowerCase(),
  );
  return `A ${name} family recipe`;
}

/** GET /catalog/yais for a short list, such as the Home page's featured Yais. */
export function useYais(params = {}) {
  return useQuery({
    queryKey: ["catalog", "yais", params],
    queryFn: ({ signal }) =>
      api(withQuery("/catalog/yais", params), { signal }),
  });
}

/** GET /catalog/classes for a short list, such as the Home page's featured classes. */
export function useClasses(params = {}) {
  return useQuery({
    queryKey: ["catalog", "classes", params],
    queryFn: ({ signal }) =>
      api(withQuery("/catalog/classes", params), { signal }),
  });
}

/** A list that loads more pages with `nextCursor`, for the Browse pages. */
function usePagedList(path, key, params) {
  return useInfiniteQuery({
    queryKey: ["catalog", key, "pages", params],
    queryFn: ({ signal, pageParam }) =>
      api(withQuery(path, { ...params, cursor: pageParam }), { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** GET /catalog/yais, a page at a time: q and region. */
export function useYaiPages(params) {
  return usePagedList("/catalog/yais", "yais", params);
}

/** GET /catalog/classes, a page at a time: q. */
export function useClassPages(params) {
  return usePagedList("/catalog/classes", "classes", params);
}

/** GET /catalog/yais/{yaiId}: her story, photos and classes. */
export function useYai(yaiId) {
  return useQuery({
    queryKey: ["catalog", "yai", yaiId],
    queryFn: ({ signal }) => api(`/catalog/yais/${yaiId}`, { signal }),
    enabled: Boolean(yaiId),
  });
}
