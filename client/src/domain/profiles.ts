/** Profiles (ArcTV Plus): the shapes shared by the picker, the editor and the store. See docs/PROFILES.md. */
export type ProfileKind = "adult" | "kids";

export interface Profile {
  id: string;
  name: string;
  /** One of AVATARS' ids. */
  avatar: string;
  kind: ProfileKind;
  /** The PIN itself never leaves the server; this only says a PIN is needed to open, change or remove the profile. */
  hasPin: boolean;
  /** The account's own profile: always there, never removed, never a kids profile. */
  isDefault: boolean;
}

/** An account can have this many profiles, any mix of adult and kids. (The server enforces it too.) */
export const PROFILE_LIMIT = 5;
export const PROFILE_NAME_MAX = 24;
export const PIN_LENGTH = 4;
export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);

export interface Avatar {
  id: string;
  label: string;
  glyph: string;
  from: string;
  to: string;
}

/** Preset avatars, drawn as a coloured tile with a glyph. The ids are what is stored (and what the Firestick app must map to its own artwork). */
export const AVATARS: readonly Avatar[] = [
  { id: "sunrise", label: "Sunrise", glyph: "🌄", from: "#ff9a3d", to: "#ff3d68" },
  { id: "ocean", label: "Ocean", glyph: "🌊", from: "#19e6ff", to: "#2f80ff" },
  { id: "forest", label: "Forest", glyph: "🌲", from: "#2dd9a8", to: "#1f8f5f" },
  { id: "violet", label: "Violet", glyph: "🔮", from: "#9b5cff", to: "#5a3df0" },
  { id: "ember", label: "Ember", glyph: "🔥", from: "#ff7a3d", to: "#c8231a" },
  { id: "mint", label: "Mint", glyph: "🍃", from: "#7af0c9", to: "#19b4a8" },
  { id: "astro", label: "Astronaut", glyph: "🧑‍🚀", from: "#4f7cff", to: "#1b2a6b" },
  { id: "monster", label: "Monster", glyph: "👾", from: "#ffc83d", to: "#ff7a3d" },
  { id: "fox", label: "Fox", glyph: "🦊", from: "#ff9f5a", to: "#d9531e" },
  { id: "robot", label: "Robot", glyph: "🤖", from: "#9aa7bd", to: "#4b566b" },
  { id: "wave", label: "Wave", glyph: "🏄", from: "#3dd6ff", to: "#2a62ff" },
  { id: "bolt", label: "Bolt", glyph: "⚡", from: "#ffe14d", to: "#ff9d1f" },
];

export const avatarById = (id: string): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;

/**
 * Genres a kids profile never shows (Home, Movies, TV Shows, Search, Genres, "You may also like"), on top of whatever the profile blocks itself.
 * It works on the genres an addon reports: a title that comes with no genres can't be matched (same limit as Blocked Genres).
 */
export const KIDS_BLOCKED_GENRES: readonly string[] = ["Horror", "Thriller", "Crime", "War", "Mystery", "Film-Noir", "Adult"];
