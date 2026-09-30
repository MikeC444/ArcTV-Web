import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cinemeta from "../assets/cinemeta_manifest.json";
import { StremioAddonProvider } from "./provider";
import { normalizeManifest } from "./stremio/client";

const manifestJson = { id: "tv.mango.catalog", name: "Mango TV Catalog", version: "1.0.0", resources: ["catalog", "meta"], types: ["movie", "series"], catalogs: [{ type: "movie", id: "popular", name: "Popular", extra: [{ name: "skip" }] }] };
const provider = (id: string) => new StremioAddonProvider(`https://x/${id}/manifest.json`, normalizeManifest({ ...manifestJson, id }));

describe("providers: the person's addons plus the built-in catalog", () => {
  let useProviders: typeof import("./registry").useProviders;
  beforeEach(async () => {
    vi.resetModules();
    ({ useProviders } = await import("./registry"));
  });

  it("lists the built-in catalog after the person's own addons, and keeps it when their addons change", () => {
    useProviders.getState().replaceAll([provider("own.a"), provider("own.b")]);
    useProviders.getState().setBuiltin(provider("tv.mango.catalog"));
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["own.a", "own.b", "tv.mango.catalog"]);
    useProviders.getState().replaceAll([provider("own.c")]);
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["own.c", "tv.mango.catalog"]);
    useProviders.getState().replaceAll([]); // e.g. an account with no addons at all
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["tv.mango.catalog"]);
    useProviders.getState().setBuiltin(null);
    expect(useProviders.getState().providers).toEqual([]);
  });

  it("never lists it twice if the person installed the very same addon", () => {
    useProviders.getState().setBuiltin(provider("tv.mango.catalog"));
    useProviders.getState().replaceAll([provider("tv.mango.catalog")]);
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["tv.mango.catalog"]);
  });
});

describe("detecting the built-in catalog", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function detect(answer: () => Response | Promise<Response>) {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => answer()));
    const { detectBuiltinCatalog } = await import("./builtinCatalog");
    const { useProviders } = await import("./registry");
    await detectBuiltinCatalog();
    return useProviders.getState();
  }

  it("adds it when the server offers it", async () => {
    const state = await detect(() => new Response(JSON.stringify(manifestJson), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(state.builtin?.id).toBe("tv.mango.catalog");
    expect(state.builtinChecked).toBe(true);
  });

  it("carries on without it when the server has none (404), says something else, or can't be reached", async () => {
    for (const answer of [() => new Response('{"err":"off"}', { status: 404 }), () => new Response(JSON.stringify({ ...manifestJson, id: "someone.else" }), { status: 200 }), () => Promise.reject(new TypeError("offline"))]) {
      const state = await detect(answer);
      expect(state.builtin).toBeNull();
      expect(state.providers).toEqual([]);
      expect(state.builtinChecked).toBe(true); // screens stop waiting
    }
  });

  it("only asks once per page load", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(manifestJson), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { detectBuiltinCatalog } = await import("./builtinCatalog");
    await Promise.all([detectBuiltinCatalog(), detectBuiltinCatalog()]);
    await detectBuiltinCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("what visitors without an account browse with", () => {
  it("is the built-in catalog when there is one, otherwise Cinemeta — and nothing is stored either way", async () => {
    vi.resetModules();
    const { useProviders } = await import("./registry");
    const { useAddons } = await import("../state/addons");
    localStorage.clear();

    useAddons.getState().loadGuestDefault();
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual([(cinemeta as { id: string }).id]);

    useProviders.getState().setBuiltin(provider("tv.mango.catalog"));
    useAddons.getState().loadGuestDefault();
    expect(useProviders.getState().providers.map((p) => p.id)).toEqual(["tv.mango.catalog"]);
    expect(useAddons.getState().addons).toEqual([]);
    expect(useAddons.getState().ready).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
