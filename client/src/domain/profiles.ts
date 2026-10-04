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
  /** Picture file under /avatars/. */
  src: string;
}

const avatar = (id: string, label: string): Avatar => ({ id, label, src: `/avatars/${id}.webp` });

/** Preset avatars (pictures in public/avatars). The ids are what is stored (and what the Firestick app must map to its own artwork). */
export const AVATARS: readonly Avatar[] = [
  avatar("fox", "Fox"),
  avatar("cat", "Cat"),
  avatar("dog", "Dog"),
  avatar("panda", "Panda"),
  avatar("frog", "Frog"),
  avatar("owl", "Owl"),
  avatar("ghost", "Ghost"),
  avatar("robot", "Robot"),
  avatar("alien", "Alien"),
  avatar("astronaut", "Astronaut"),
  avatar("raccoon", "Raccoon"),
  avatar("penguin", "Penguin"),
  avatar("octopus", "Octopus"),
  avatar("dragon", "Dragon"),
  avatar("retro-tv", "Retro TV"),
  avatar("lion", "Lion"),
];

/** Ids from the old colour-tile set that profiles may still carry, shown as the nearest new picture. */
const LEGACY_AVATARS: Record<string, string> = { astro: "astronaut", monster: "alien", sunrise: "fox", ocean: "octopus", forest: "frog", violet: "ghost", ember: "dragon", mint: "owl", wave: "penguin", bolt: "robot" };

export const avatarById = (id: string): Avatar => AVATARS.find((a) => a.id === (LEGACY_AVATARS[id] ?? id)) ?? AVATARS[0]!;

/**
 * Genres a kids profile never shows (Home, Movies, TV Shows, Search, Genres, "You may also like"), on top of whatever the profile blocks itself.
 * It works on the genres an addon reports: a title that comes with no genres can't be matched (same limit as Blocked Genres).
 */
export const KIDS_BLOCKED_GENRES: readonly string[] = ["Horror", "Thriller", "Crime", "War", "Mystery", "Film-Noir", "Adult"];
