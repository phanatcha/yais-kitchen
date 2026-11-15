import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * A search box kept in the URL as `?q=`, so a search can be shared and the
 * Home page's class finder can start one. Typing updates the URL after a
 * short pause; the list follows the URL.
 * `setParams({ region: "north" })` changes other filters; an empty value
 * removes one.
 * @returns {{ text: string, setText: Function, q: string, params: URLSearchParams, setParams: Function }}
 */
export function useSearchText() {
  const [params, setSearchParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);

  function setParams(patch) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === q) return undefined;
    const timer = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) next.set("q", trimmed);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [text, q, setSearchParams]);

  return { text, setText, q, params, setParams };
}
