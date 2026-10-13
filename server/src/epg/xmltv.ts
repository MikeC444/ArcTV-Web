/**
 * A small streaming reader for XMLTV listings (the format TV-guide data comes in). It reads a gzip-decompressed stream in pieces, never holding
 * the whole file, and keeps only the programmes that overlap a time window, so a country's multi-megabyte file becomes a few megabytes in memory.
 */
export interface EpgChannel {
  id: string;
  names: string[];
  icon: string | null;
}
export interface EpgProgramme {
  /** Start and end, in seconds since 1970. */
  s: number;
  e: number;
  title: string;
  subtitle?: string;
  desc?: string;
  category?: string;
}
export interface EpgData {
  channels: Map<string, EpgChannel>;
  programmes: Map<string, EpgProgramme[]>;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** "20261012005000 +0100" → seconds since 1970 (UTC). Null when it is not a time. */
export function parseXmltvTime(value: string | undefined): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec((value ?? "").trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  const offset = m[7] ? (m[7][0] === "-" ? -1 : 1) * (Number(m[7].slice(1, 3)) * 3600 + Number(m[7].slice(3, 5)) * 60) : 0;
  return Math.round(ms / 1000) - offset;
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : undefined;
};
const firstText = (body: string, tag: string): string | undefined => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(body);
  const text = m ? decodeEntities(m[1]!.replace(/<[^>]*>/g, "")).trim() : "";
  return text === "" ? undefined : text;
};

export interface ParseOptions {
  /** Only programmes that end after `from` and start before `to` (seconds since 1970) are kept. */
  from: number;
  to: number;
  /** A programme's description is cut to this many characters (the guide shows it in a small panel). */
  maxDescription?: number;
}

const MAX_BUFFER = 8 * 1024 * 1024; // one element is never this big; a stream without a closing tag is not XMLTV

/** Reads XMLTV from pieces of text (or bytes) in order. */
export async function parseXmltv(chunks: AsyncIterable<string | Uint8Array>, options: ParseOptions): Promise<EpgData> {
  const channels = new Map<string, EpgChannel>();
  const programmes = new Map<string, EpgProgramme[]>();
  const maxDescription = options.maxDescription ?? 260;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const take = () => {
    let at = 0;
    for (;;) {
      const channelAt = buffer.indexOf("<channel ", at);
      const programmeAt = buffer.indexOf("<programme ", at);
      const start = channelAt < 0 ? programmeAt : programmeAt < 0 ? channelAt : Math.min(channelAt, programmeAt);
      if (start < 0) {
        // keep a possible partial opening tag at the very end
        buffer = buffer.slice(Math.max(at, buffer.length - 12));
        return;
      }
      const isChannel = start === channelAt;
      const closing = isChannel ? "</channel>" : "</programme>";
      const end = buffer.indexOf(closing, start);
      if (end < 0) {
        buffer = buffer.slice(start);
        return;
      }
      const element = buffer.slice(start, end + closing.length);
      at = end + closing.length;
      const openEnd = element.indexOf(">");
      const open = element.slice(0, openEnd + 1);
      const body = element.slice(openEnd + 1, element.length - closing.length);
      if (isChannel) {
        const id = attr(open, "id");
        if (!id) continue;
        const names = [...body.matchAll(/<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/g)].map((m) => decodeEntities(m[1]!).trim()).filter(Boolean);
        const icon = /<icon\s[^>]*src\s*=\s*"([^"]*)"/.exec(body)?.[1];
        channels.set(id, { id, names, icon: icon ? decodeEntities(icon) : null });
      } else {
        const channel = attr(open, "channel");
        const s = parseXmltvTime(attr(open, "start"));
        const e = parseXmltvTime(attr(open, "stop"));
        if (!channel || s === null || e === null || e <= s || e <= options.from || s >= options.to) continue;
        const title = firstText(body, "title");
        if (!title) continue;
        const programme: EpgProgramme = { s, e, title };
        const subtitle = firstText(body, "sub-title");
        const desc = firstText(body, "desc");
        const category = firstText(body, "category");
        if (subtitle) programme.subtitle = subtitle;
        if (desc) programme.desc = desc.length > maxDescription ? `${desc.slice(0, maxDescription - 1).trimEnd()}…` : desc;
        if (category) programme.category = category;
        const list = programmes.get(channel);
        if (list) list.push(programme);
        else programmes.set(channel, [programme]);
      }
    }
  };

  for await (const chunk of chunks) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    take();
    if (buffer.length > MAX_BUFFER) throw new Error("This listings file is not valid XMLTV.");
  }
  buffer += decoder.decode();
  take();
  for (const list of programmes.values()) list.sort((a, b) => a.s - b.s);
  return { channels, programmes };
}
