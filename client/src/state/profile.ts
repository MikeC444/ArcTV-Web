import { globalKey } from "./persist";

/**
 * Profiles. The app has one implicit profile per account today; "Profiles" is a planned ArcTV Plus feature.
 * Everything personal to taste (feedback, recommendation caches) is already keyed by (account, profile), so when real profiles
 * arrive they only need to supply the active profile id here and nothing is shared between profiles.
 */
export const DEFAULT_PROFILE_ID = "main";

/** The authorised active profile of this signed-in account. Always the account's own default until multiple profiles exist. */
export const activeProfileId = (_userId: string): string => DEFAULT_PROFILE_ID;

/** Keyed by account and profile but kept outside the per-account wipe, so likes survive signing out and in (they exist nowhere else); another person on this browser has a different account id and never sees them. */
export const profileKey = (userId: string, profileId: string, name: string): string => globalKey(`profile:${userId}:${profileId}:${name}`);
