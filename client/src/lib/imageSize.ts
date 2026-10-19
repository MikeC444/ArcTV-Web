/**
 * The Home hero is a full-width picture, so a "medium" background looks soft on a big window. Addons usually serve the same image in
 * several sizes and say which in the address; ask for the biggest where we recognise the pattern:
 *   Metahub (Cinemeta)  …/background/medium/tt123/img   →  …/background/large/tt123/img
 *   TMDB                …/t/p/w780/abc.jpg              →  …/t/p/original/abc.jpg
 * Anything else is returned unchanged. The caller falls back to the original address if the bigger one fails to load.
 */
export function sharpBackdrop(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/(\/background\/)(?:small|medium)(\/)/i, "$1large$2")
    .replace(/(\/t\/p\/)w(?:300|500|780|1280)(\/)/i, "$1original$2");
}

/**
 * The reverse for a card: a wide picture on a catalogue page is only a few hundred pixels across, so the biggest size is a waste of download (a screen of
 * them holds twenty). Metahub's large goes to medium, and TMDB's original and w1280 to w780; anything else is returned unchanged. The caller falls
 * back to the original address if the smaller one fails to load.
 */
export function cardBackdrop(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/(\/background\/)large(\/)/i, "$1medium$2")
    .replace(/(\/t\/p\/)(?:original|w1280)(\/)/i, "$1w780$2");
}
