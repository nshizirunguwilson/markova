"use client";

import { useEffect, useState } from "react";

/**
 * Whether a media query currently matches.
 *
 * Only for the handful of decisions CSS cannot make on its own. A layout
 * change belongs in a Tailwind breakpoint every time; this is for the ones
 * that are not styling at all - chiefly `inert`, which is an attribute and so
 * has no CSS equivalent, and which decides whether an off-screen drawer's
 * links are reachable by Tab.
 *
 * `initial` is what it reports before the browser has been asked, which
 * matters because the server renders first and has no viewport. It defaults
 * to true, so the first paint treats the panel as on-screen: a control that
 * is briefly interactive when it should not be is a smaller fault than one
 * that is briefly inert when it should not be.
 */
export function useMediaQuery(query: string, initial = true): boolean {
  const [matches, setMatches] = useState(initial);

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      // A browser that cannot answer keeps the initial assumption.
      return;
    }
    /* Set through the updater rather than straight, so a value that is
       already right does not schedule a second render. The first paint after
       hydration is the one case where this actually differs. */
    const read = (value: boolean) =>
      setMatches((current) => (current === value ? current : value));
    read(mq.matches);
    const onChange = (e: MediaQueryListEvent) => read(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * The `lg` breakpoint, where the navigation stops being an overlay and takes
 * its place in the layout. Not `md`: at 768px a permanent 15rem panel leaves
 * the page too little to work in, which is the whole reason the panel floats.
 */
export const DESKTOP_QUERY = "(min-width: 1024px)";

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
