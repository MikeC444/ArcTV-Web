import { sharpBackdrop } from "./imageSize";

/** The pictures the Home hero will show, in the order it shows them: each title's backdrop, then its logo. */
export function heroImageAddresses(items: ReadonlyArray<{ backdropUrl?: string | null; logoUrl?: string | null }>): Array<{ url: string; fallback: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; fallback: string }> = [];
  for (const item of items) {
    if (item.backdropUrl) out.push({ url: sharpBackdrop(item.backdropUrl) ?? item.backdropUrl, fallback: item.backdropUrl });
    if (item.logoUrl) out.push({ url: item.logoUrl, fallback: item.logoUrl });
  }
  return out.filter((entry) => !seen.has(entry.url) && (seen.add(entry.url), true));
}

// Held so the pictures stay in memory until the hero shows them (an image nobody references can be dropped before it is used).
const held = new Map<string, HTMLImageElement>();

function load(entry: { url: string; fallback: string }): Promise<void> {
  const existing = held.get(entry.url);
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer"; // the same request the hero's own <img> makes, so the browser reuses it
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => {
      // as in the hero itself: if the bigger picture does not exist, take the addon's own
      if (img.src !== entry.fallback) img.src = entry.fallback;
      else resolve();
    };
    img.src = entry.url;
    held.set(entry.url, img);
  });
}

/**
 * Fetches the hero's pictures ahead of time: the first one at once, the rest one after another once it has arrived — so the slide that
 * is showing never waits behind the others for bandwidth, and every later slide is already in the browser's cache when its turn comes.
 * Returns a function that stops the queue (the pictures already fetched stay cached).
 */
export function preloadHero(items: ReadonlyArray<{ backdropUrl?: string | null; logoUrl?: string | null }>): () => void {
  const queue = heroImageAddresses(items);
  let stopped = false;
  void (async () => {
    for (const entry of queue) {
      if (stopped) return;
      await load(entry);
    }
  })();
  return () => {
    stopped = true;
  };
}
