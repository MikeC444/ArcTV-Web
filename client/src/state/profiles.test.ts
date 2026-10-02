import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";

const calls: Array<{ path: string; method: string; body?: unknown; headers?: Record<string, string> }> = [];
let respond: (path: string, method: string) => unknown = () => undefined;
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
      const method = options.method ?? "GET";
      calls.push({ path, method, body: options.body, headers: options.headers });
      const result = respond(path, method);
      if (result instanceof Error) throw result;
      return result;
    }),
  };
});

const { useProfiles, needsProfilePicker, activeProfileOf } = await import("./profiles");
const { activeProfileId, libraryKey, libraryName, setActiveProfile, DEFAULT_PROFILE_ID } = await import("./profile");
const { useMyList } = await import("./myList");
const { useBlockedSet, effectiveBlockedSet } = await import("./blockedGenres");
const { resetAllStores } = await import("./sync");

const main = { id: "main", name: "Alex", avatar: "sunrise", kind: "adult", hasPin: false, isDefault: true } as const;
const kid = { id: "p_kid", name: "Kids", avatar: "monster", kind: "kids", hasPin: false, isDefault: false } as const;
const sam = { id: "p_sam", name: "Sam", avatar: "ocean", kind: "adult", hasPin: true, isDefault: false } as const;
const answer = (over: Record<string, unknown> = {}) => ({ supported: true, plus: true, limit: 5, profiles: [main, kid, sam], active: "main", ...over });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  calls.length = 0;
  respond = () => undefined;
  resetAllStores();
});

describe("which profile the app is on", () => {
  it("starts on the account's own profile and files its cache under the names it always had", () => {
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(libraryName("myList")).toBe("myList");
    expect(libraryKey("u1", "myList")).toBe("mtv:v1:u1:myList");
  });

  it("gives every other profile its own cache entries, so nothing is shared", () => {
    setActiveProfile("p_kid");
    expect(libraryName("myList")).toBe("profile:p_kid:myList");
    expect(libraryKey("u1", "continueWatching")).toBe("mtv:v1:u1:profile:p_kid:continueWatching");
    expect(libraryKey("u1", "continueWatching")).not.toBe((setActiveProfile("main"), libraryKey("u1", "continueWatching")));
  });

  it("adopts the profile the server says this browser is on, once loaded", async () => {
    respond = () => answer({ active: "p_kid" });
    await useProfiles.getState().load("u1");
    expect(activeProfileId()).toBe("p_kid");
    expect(activeProfileOf(useProfiles.getState())?.name).toBe("Kids");
  });

  it("falls back to the account's own profile if the active one isn't in the list", async () => {
    respond = () => answer({ active: "gone" });
    await useProfiles.getState().load("u1");
    expect(activeProfileId()).toBe("main");
  });

  it("keeps each profile's My List separate in this browser", () => {
    setActiveProfile("main");
    useMyList.getState().hydrate("u1");
    useMyList.getState().toggle({ id: "tt1", type: "MOVIE", title: "Main's", description: "", posterUrl: null, backdropUrl: null, providerId: "p", genres: [], cast: [], seasons: [], watched: false });
    expect(useMyList.getState().items).toHaveLength(1);

    setActiveProfile("p_kid");
    useMyList.getState().hydrate("u1");
    expect(useMyList.getState().items).toEqual([]); // the kids profile starts empty
    setActiveProfile("main");
    useMyList.getState().hydrate("u1");
    expect(useMyList.getState().items).toHaveLength(1);
  });
});

describe("loading profiles", () => {
  it("treats an older backend (no profiles) as a single implicit profile", async () => {
    respond = () => ({ supported: false, plus: false, limit: 5, profiles: [], active: "main" });
    await useProfiles.getState().load("u1");
    const state = useProfiles.getState();
    expect(state.ready).toBe(true);
    expect(needsProfilePicker(state)).toBe(false);
    expect(activeProfileId()).toBe("main");
  });

  it("remembers the last answer per account for when the service can't be reached", async () => {
    respond = () => answer({ active: "p_kid" });
    await useProfiles.getState().load("u1");
    resetAllStores();
    respond = () => new ApiClientError(0, "network", "offline");
    await useProfiles.getState().load("u1");
    expect(activeProfileId()).toBe("p_kid");
    expect(useProfiles.getState().profiles).toHaveLength(3);

    resetAllStores();
    await useProfiles.getState().load("someone-else"); // never another account's profiles
    expect(useProfiles.getState().profiles).toEqual([]);
    expect(activeProfileId()).toBe("main");
  });
});

describe("the picker at launch", () => {
  it("shows for Plus accounts with more than one profile, once per tab", async () => {
    respond = () => answer();
    await useProfiles.getState().load("u1");
    expect(needsProfilePicker(useProfiles.getState())).toBe(true);
    respond = () => ({ profile: main });
    await useProfiles.getState().select("main");
    expect(needsProfilePicker(useProfiles.getState())).toBe(false);
    // a reload in the same tab (a profile switch reloads) doesn't ask again
    resetAllStores();
    respond = () => answer();
    await useProfiles.getState().load("u1");
    expect(needsProfilePicker(useProfiles.getState())).toBe(false);
  });

  it("is skipped with one profile, or without Plus", async () => {
    respond = () => answer({ profiles: [main] });
    await useProfiles.getState().load("u1");
    expect(needsProfilePicker(useProfiles.getState())).toBe(false);
    resetAllStores();
    sessionStorage.clear();
    respond = () => answer({ plus: false, profiles: [main] });
    await useProfiles.getState().load("u1");
    expect(needsProfilePicker(useProfiles.getState())).toBe(false);
  });
});

describe("choosing and managing", () => {
  it("sends the PIN with the choice, and reports whether the library changed", async () => {
    respond = () => answer();
    await useProfiles.getState().load("u1");
    respond = () => ({ profile: sam });
    expect(await useProfiles.getState().select("p_sam", "1234")).toBe(true);
    expect(calls.at(-1)).toMatchObject({ path: "/profiles/select", method: "POST", body: { profileId: "p_sam", pin: "1234" } });
    expect(await useProfiles.getState().select("main")).toBe(false); // already on it: no reload needed
    expect(calls.at(-1)?.body).toEqual({ profileId: "main" });
  });

  it("surfaces a wrong PIN and doesn't mark a profile as chosen", async () => {
    respond = () => answer();
    await useProfiles.getState().load("u1");
    respond = () => new ApiClientError(403, "wrong_pin", "That PIN isn't right.");
    await expect(useProfiles.getState().select("p_sam", "0000")).rejects.toMatchObject({ code: "wrong_pin" });
    expect(useProfiles.getState().chosen).toBe(false);
  });

  it("creates, edits (with the current PIN in a header) and removes, refreshing the list each time", async () => {
    respond = () => answer();
    await useProfiles.getState().load("u1");
    respond = (path, method) => (path === "/profiles" && method === "GET" ? answer() : { profile: kid });
    await useProfiles.getState().create({ name: "Kids", avatar: "monster", kind: "kids" });
    expect(calls.some((c) => c.method === "POST" && c.path === "/profiles")).toBe(true);

    await useProfiles.getState().update("p_sam", { name: "Samuel", pin: null }, "1234");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put).toMatchObject({ path: "/profiles/p_sam", body: { name: "Samuel", pin: null }, headers: { "X-ArcTV-Pin": "1234" } });

    await useProfiles.getState().remove("p_sam", "1234");
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del).toMatchObject({ path: "/profiles/p_sam", headers: { "X-ArcTV-Pin": "1234" } });
    expect(calls.filter((c) => c.method === "GET" && c.path === "/profiles").length).toBeGreaterThanOrEqual(4); // load + 3 refreshes
  });

  it("a list refresh never moves the page onto another profile's library", async () => {
    respond = () => answer({ active: "main" });
    await useProfiles.getState().load("u1");
    respond = () => answer({ active: "p_kid" });
    await useProfiles.getState().refresh();
    expect(activeProfileId()).toBe("main");
    expect(useProfiles.getState().activeId).toBe("main");
  });
});

describe("kids profiles", () => {
  it("hide the kids genres on top of the profile's own blocked genres", async () => {
    respond = () => answer({ active: "main" });
    await useProfiles.getState().load("u1");
    expect(effectiveBlockedSet().has("horror")).toBe(false);

    resetAllStores();
    respond = () => answer({ active: "p_kid" });
    await useProfiles.getState().load("u1");
    const blocked = effectiveBlockedSet();
    for (const genre of ["horror", "thriller", "crime", "war", "mystery"]) expect(blocked.has(genre)).toBe(true);
    expect(blocked.has("animation")).toBe(false);
    expect(typeof useBlockedSet).toBe("function");
  });
});
