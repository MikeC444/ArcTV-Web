import { globalKey, userKey } from "./persist";

/**
 * Profiles (an ArcTV Plus feature, see docs/PROFILES.md). Every account has its own profile ("main") and, with Plus, up to four more.
 * Each profile has its own library: My List, Continue Watching, settings, addons and taste feedback; nothing is shared between profiles.
 *
 * The profile is fixed for the life of the page: choosing another one (profile picker) reloads the app, so no store ever holds
 * two profiles' data and no request can land in the wrong one. The server decides which profile requests are for (sealed cookie,
 * X-ArcTV-Profile to the backend); `setActiveProfile` only tells this page which one that is, so it files its local copies under it.
 */
export const DEFAULT_PROFILE_ID = "main";

let active = DEFAULT_PROFILE_ID;

/** Called once at launch, before any store hydrates, with the profile the server says this browser is using. */
export const setActiveProfile = (profileId: string): void => {
  active = profileId;
};

/** The profile this page is showing. (The account argument is kept for callers that pass it; one page only ever has one account.) */
export const activeProfileId = (_userId?: string): string => active;

/** Keyed by account and profile but kept outside the per-account wipe, so likes survive signing out and in (they exist nowhere else); another person on this browser has a different account id and never sees them. */
export const profileKey = (userId: string, profileId: string, name: string): string => globalKey(`profile:${userId}:${profileId}:${name}`);

/**
 * A per-profile entry of the account's local cache (My List, Continue Watching, settings, addons…). The account's own profile keeps the
 * names it always had, so nothing already cached is lost; every other profile gets its own. Wiped with the rest on sign-out.
 */
export const libraryName = (name: string): string => (active === DEFAULT_PROFILE_ID ? name : `profile:${active}:${name}`);
export const libraryKey = (userId: string, name: string): string => userKey(userId, libraryName(name));
