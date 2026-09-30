import { useMemo } from "react";
import type { Content, HomeSection } from "../domain/types";
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
