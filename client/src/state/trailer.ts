import { useEffect, useState } from "react";
import type { Content } from "../domain/types";
import { api } from "../lib/api";
import type { LookupState } from "./detailData";

const done = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

const keyOf = (c: Pick<Content, "title" | "type" | "year">) => `${c.type}|${c.title}|${c.year ?? ""}`;

/** YouTube id of a title's trailer (null when there is none). Answers are remembered for the session, and parallel asks for one title share one request. */
export function fetchTrailerId(content: Pick<Content, "title" | "type" | "year">): Promise<string | null> {
  const key = keyOf(content);
  if (done.has(key)) return Promise.resolve(done.get(key) ?? null);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const query = new URLSearchParams({ title: content.title, type: content.type });
  if (content.year) query.set("year", String(content.year));
  const request = api<{ youtubeVideoId: string | null }>(`/user/trailer?${query}`)
    .then((r) => {
      done.set(key, r.youtubeVideoId ?? null);
      return r.youtubeVideoId ?? null;
    })
    .catch(() => null) // a failed lookup is not remembered, so the next visit asks again
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Looks the trailer up once `enabled` (e.g. the slide is showing and the person has an account). */
export function useTrailer(content: Content | undefined, enabled: boolean): LookupState<string> {
  const [state, setState] = useState<LookupState<string>>({ kind: "idle" });
  const key = content ? keyOf(content) : "";
  useEffect(() => {
    if (!content || !enabled) return setState({ kind: "idle" });
    let cancelled = false;
    setState(done.has(key) ? (done.get(key) ? { kind: "found", value: done.get(key)! } : { kind: "notFound" }) : { kind: "loading" });
    void fetchTrailerId(content).then((id) => !cancelled && setState(id ? { kind: "found", value: id } : { kind: "notFound" }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return state;
}

/** Test hook. */
export const resetTrailerCache = (): void => {
  done.clear();
  inFlight.clear();
};
