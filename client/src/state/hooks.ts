import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { routes } from "../lib/routes";
import type { Content, HomeSection } from "../domain/types";
import { useAddons } from "./addons";
import { useAuth } from "./auth";
import { useMyList } from "./myList";

/** Ids of titles that are My-List entries with watched = true — every screen stamps this onto the cards it shows. */
export function useWatchedIds(): Set<string> {
  const items = useMyList((s) => s.items);
  return useMemo(() => new Set(items.filter((i) => i.watched).map((i) => i.id)), [items]);
}

export const withWatched = (content: Content, ids: Set<string>): Content => (ids.has(content.id) && !content.watched ? { ...content, watched: true } : content);
export const sectionWithWatched = (section: HomeSection, ids: Set<string>): HomeSection => ({ ...section, items: section.items.map((c) => withWatched(c, ids)) });

export function useSavedIds(): Set<string> {
  const items = useMyList((s) => s.items);
  return useMemo(() => new Set(items.map((i) => i.id)), [items]);
}

/** True once the account's addon list is known (cache or first fetch) — before that, "no providers" means "not loaded yet". */
export const useAddonsReady = (): boolean => useAddons((s) => s.ready);

/**
 * Visitors without an account can browse everything, but saving a title needs one. Wrap such an action: signed-in people
 * run it; everyone else is taken to the sign-in screen and brought back to this page afterwards.
 */
export function useAccountAction<A extends unknown[]>(action: (...args: A) => void): (...args: A) => void {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.pathname + location.search;
  return useCallback(
    (...args: A) => {
      if (signedIn) action(...args);
      else navigate(routes.auth, { state: { from } });
    },
    [signedIn, action, navigate, from],
  );
}
