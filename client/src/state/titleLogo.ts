import { useEffect, useState } from "react";
import { activeProviders, useProviders } from "../domain/registry";
import { loadDetails } from "../domain/detailSource";
import type { ContentType } from "../domain/types";

const done = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * A title's logo picture (its name set in its own lettering), looked up through the same addons as its Detail page. Continue Watching entries are
 * saved without one, so the card asks once per title for the session; parallel asks share one request and a failed ask is not remembered.
 */
export function fetchTitleLogo(providerId: string, type: ContentType, id: string): Promise<string | null> {
  const key = `${type}|${id}`;
  if (done.has(key)) return Promise.resolve(done.get(key) ?? null);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const providers = activeProviders();
  if (providers.length === 0) return Promise.resolve(null); // the addons are not loaded yet: nothing is remembered, the card asks again when they are
  const request = loadDetails(providers, providerId, type, id)
    .then((detail) => {
      const logo = detail?.logoUrl ?? null;
      done.set(key, logo);
      return logo;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** The logo to show for a title: the one it already has, else the looked-up one once `enabled`. Null while unknown or when it has none. */
export function useTitleLogo(content: { id: string; type: ContentType; providerId?: string | null; logoUrl?: string | null }, enabled: boolean): string | null {
  const [found, setFound] = useState<string | null>(() => done.get(`${content.type}|${content.id}`) ?? null);
  const providerId = content.providerId ?? "";
  const installed = useProviders((s) => s.providers.length);
  useEffect(() => {
    if (!enabled || content.logoUrl || !providerId) return;
    let live = true;
    void fetchTitleLogo(providerId, content.type, content.id).then((logo) => live && setFound(logo));
    return () => {
      live = false;
    };
  }, [enabled, content.logoUrl, content.type, content.id, providerId, installed]);
  return content.logoUrl ?? found;
}
