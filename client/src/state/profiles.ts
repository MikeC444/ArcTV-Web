import { create } from "zustand";
import { PROFILE_LIMIT, type Profile, type ProfileKind } from "../domain/profiles";
import { api } from "../lib/api";
import { readJson, userKey, writeJson } from "./persist";
import { DEFAULT_PROFILE_ID, setActiveProfile } from "./profile";

/** What GET /api/profiles answers. */
interface ProfilesResponse {
  supported: boolean;
  plus: boolean;
  limit: number;
  profiles: Profile[];
  active: string;
}

export interface ProfileInput {
  name: string;
  avatar: string;
  kind: ProfileKind;
  pin?: string;
}

interface ProfilesState {
  userId: string | null;
  /** False until the list has been read (or its last copy loaded); the app doesn't draw a library before that. */
  ready: boolean;
  /** False when the backend has no profiles yet (it answered 404): everyone then has the one implicit profile. */
  supported: boolean;
  plus: boolean;
  limit: number;
  profiles: Profile[];
  activeId: string;
  /** True once a profile has been picked in this browser tab (the picker is shown once per visit, not on every page). */
  chosen: boolean;
  /** Reads the account's profiles and tells the rest of the app which one this browser is on. Called once, before any library is loaded. */
  load(userId: string): Promise<void>;
  /** Reads the list again after a change. */
  refresh(): Promise<void>;
  reset(): void;
  /** Opens a profile for this browser (asks the server, which checks Plus and the PIN). Returns true when it is a different profile, so the app must reload to show its library. */
  select(profileId: string, pin?: string): Promise<boolean>;
  create(input: ProfileInput): Promise<Profile>;
  /** `currentPin` is the PIN the profile has now, when it is locked. `pin: null` removes the PIN. */
  update(profileId: string, patch: Partial<Omit<ProfileInput, "pin">> & { pin?: string | null }, currentPin?: string): Promise<Profile>;
  remove(profileId: string, currentPin?: string): Promise<void>;
}

const NONE = { supported: false, plus: false, limit: PROFILE_LIMIT, profiles: [] as Profile[], activeId: DEFAULT_PROFILE_ID };
const cacheKey = (userId: string) => userKey(userId, "profiles");
const chosenKey = (userId: string) => `mtv:v1:profileChosen:${userId}`;

function readChosen(userId: string): boolean {
  try {
    return sessionStorage.getItem(chosenKey(userId)) === "1";
  } catch {
    return false;
  }
}
function writeChosen(userId: string): void {
  try {
    sessionStorage.setItem(chosenKey(userId), "1");
  } catch {
    /* private mode: the picker simply shows again next time */
  }
}

/** Does this launch start at "Who's watching?" — the account has Plus and more than one profile to choose from, and none has been picked yet in this tab. */
export const needsProfilePicker = (s: Pick<ProfilesState, "ready" | "supported" | "plus" | "profiles" | "chosen">): boolean => s.ready && s.supported && s.plus && s.profiles.length > 1 && !s.chosen;

/** The profile in use. Undefined while profiles aren't available (older backend, no Plus, or not loaded yet). */
export const activeProfileOf = (s: Pick<ProfilesState, "profiles" | "activeId">): Profile | undefined => s.profiles.find((p) => p.id === s.activeId);

export const useProfiles = create<ProfilesState>((set, get) => {
  const apply = (userId: string, answer: ProfilesResponse) => {
    const known = answer.profiles.some((p) => p.id === answer.active);
    const activeId = known ? answer.active : DEFAULT_PROFILE_ID;
    setActiveProfile(activeId);
    set({ userId, ready: true, supported: answer.supported, plus: answer.plus, limit: answer.limit, profiles: answer.profiles, activeId });
  };

  return {
    userId: null,
    ready: false,
    ...NONE,
    chosen: false,

    async load(userId) {
      set({ userId, chosen: readChosen(userId) });
      try {
        const answer = await api<ProfilesResponse>("/profiles");
        writeJson(cacheKey(userId), answer);
        apply(userId, answer);
      } catch {
        // Offline or the service is down: carry on with the last answer (so the same profile as last time; the copy is per account),
        // else with the one implicit profile.
        apply(userId, readJson<ProfilesResponse | null>(cacheKey(userId), null) ?? { ...NONE, active: DEFAULT_PROFILE_ID });
      }
    },

    async refresh() {
      const userId = get().userId;
      if (!userId) return;
      const answer = await api<ProfilesResponse>("/profiles");
      writeJson(cacheKey(userId), answer);
      // The active profile only changes through select() (and a reload); a list refresh must not move this page onto another library.
      set({ supported: answer.supported, plus: answer.plus, limit: answer.limit, profiles: answer.profiles });
    },

    reset() {
      setActiveProfile(DEFAULT_PROFILE_ID);
      set({ userId: null, ready: false, ...NONE, chosen: false });
    },

    async select(profileId, pin) {
      const userId = get().userId;
      await api("/profiles/select", { method: "POST", body: pin ? { profileId, pin } : { profileId } });
      if (userId) writeChosen(userId);
      set({ chosen: true });
      return profileId !== get().activeId;
    },

    async create(input) {
      const { profile } = await api<{ profile: Profile }>("/profiles", { method: "POST", body: input });
      await get().refresh();
      return profile;
    },

    async update(profileId, patch, currentPin) {
      const { profile } = await api<{ profile: Profile }>(`/profiles/${encodeURIComponent(profileId)}`, { method: "PUT", body: patch, headers: currentPin ? { "X-ArcTV-Pin": currentPin } : undefined });
      await get().refresh();
      return profile;
    },

    async remove(profileId, currentPin) {
      await api(`/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE", headers: currentPin ? { "X-ArcTV-Pin": currentPin } : undefined });
      await get().refresh();
    },
  };
});
