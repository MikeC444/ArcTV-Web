import type { CastMember } from "./types";

/** What the server's `/api/cast` answers: TMDB's cast, with a photo address and the character where it has them. */
export interface TmdbCastEntry {
  name: string;
  character: string | null;
  photo: string | null;
}

const key = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Fills in photos (and characters) the addon didn't send, matching people by name. Whatever the addon did send is kept as it is — its
 * order, its photos, its characters. If the addon sent no cast at all, TMDB's list is used.
 */
export function mergeCast(addon: CastMember[], tmdb: TmdbCastEntry[]): CastMember[] {
  if (tmdb.length === 0) return addon;
  if (addon.length === 0) return tmdb.map((m) => ({ name: m.name, role: m.character, photoUrl: m.photo }));
  const byName = new Map(tmdb.map((m) => [key(m.name), m] as const));
  return addon.map((member) => {
    if (member.photoUrl && member.role) return member;
    const match = byName.get(key(member.name));
    if (!match) return member;
    return { ...member, photoUrl: member.photoUrl || match.photo, role: member.role || match.character };
  });
}
