import type { EpgChannel } from "./xmltv.js";

/** Words that only describe how a channel is delivered, not which channel it is. */
const NOISE = new Set(["hd", "fhd", "uhd", "sd", "4k", "hevc", "h265", "h264", "1080p", "1080", "720p", "720", "576p", "480p", "50fps", "60fps", "live", "tv"]);

/** "📺 BBC One HD (1080p)" → "bbc one": lower case, no accents, symbols or delivery words; "+1" stays a word. */
export function normalizeChannelName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\+\s*1\b/g, " plus1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w !== "" && !NOISE.has(w));
  // a name that was only noise ("TV", "HD") keeps nothing and so matches nothing
  return words.join(" ");
}

/** An XMLTV channel id like "BBC.One.Lon.HD.uk" read as a name ("bbc one lon"): dots are word breaks and the trailing country code goes. */
export function idToName(id: string): string {
  const parts = id.split(".");
  if (parts.length > 1 && /^[a-z]{2,3}$/i.test(parts[parts.length - 1]!)) parts.pop();
  return normalizeChannelName(parts.join(" "));
}

export interface ChannelIndex {
  exact: Map<string, EpgChannel>;
  /** The same names with the spaces taken out, so "ITV 1" finds "ITV1". */
  squeezed: Map<string, EpgChannel>;
  /** Every indexed name, shortest first, for prefix matching. */
  names: Array<{ name: string; channel: EpgChannel }>;
}

export function buildChannelIndex(channels: Iterable<EpgChannel>, hasProgrammes: (id: string) => boolean): ChannelIndex {
  const exact = new Map<string, EpgChannel>();
  const squeezed = new Map<string, EpgChannel>();
  const names: ChannelIndex["names"] = [];
  for (const channel of channels) {
    if (!hasProgrammes(channel.id)) continue; // a channel with nothing scheduled is no use to the guide
    for (const raw of [...channel.names.map(normalizeChannelName), idToName(channel.id)]) {
      if (raw === "" || exact.has(raw)) continue;
      exact.set(raw, channel);
      if (!squeezed.has(raw.replace(/ /g, ""))) squeezed.set(raw.replace(/ /g, ""), channel);
      names.push({ name: raw, channel });
    }
  }
  names.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return { exact, squeezed, names };
}

/** The shortest a name may be to match by its start ("bbc" must not match every BBC channel). */
const MIN_PREFIX = 5;
/** The shortest a name may be to match by its end ("dave" is "u and dave"). */
const MIN_SUFFIX = 4;

/** When one channel comes in regional versions ("BBC One London", "BBC One Wales"...), these are the ones to prefer. */
const PREFERRED_REGION = /\b(london|lon|england)\b/;

/**
 * Which XMLTV channel a name from an addon is: the same name, else the same letters and digits ("ITV 1" is "ITV1"), else the plainest channel
 * whose name starts with it ("BBC One" is "BBC One London"), else one that ends with it ("Dave" is "U and Dave"). Null when unsure.
 */
export function matchChannel(index: ChannelIndex, name: string): EpgChannel | null {
  const q = normalizeChannelName(name);
  if (q === "") return null;
  const same = index.exact.get(q) ?? index.squeezed.get(q.replace(/ /g, ""));
  if (same) return same;
  // "Film4" is not "Film4 +1": a channel that runs an hour behind is only matched when asked for
  const candidates = /\bplus1\b/.test(q) ? index.names : index.names.filter((n) => !/\bplus1\b/.test(n.name));
  const starting = q.length >= MIN_PREFIX ? candidates.filter((n) => n.name.startsWith(`${q} `)) : [];
  if (starting.length > 0) return (starting.find((n) => PREFERRED_REGION.test(n.name)) ?? starting[0]!).channel;
  return q.length >= MIN_SUFFIX ? (candidates.find((n) => n.name.endsWith(` ${q}`))?.channel ?? null) : null;
}
