"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe matchMedia hook.
 * Defaults to `false` on the server so server/client renders agree.
 * The correct value is applied after the first client-side effect fires.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
