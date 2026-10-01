import { create } from "zustand";
import cinemetaManifest from "../assets/cinemeta_manifest.json";
import { StremioAddonProvider } from "../domain/provider";
import { useProviders } from "../domain/registry";
import { clearAddonCache, fetchManifest, normalizeManifest } from "../domain/stremio/client";
import { normalizeManifestUrl } from "../domain/stremio/url";
import type { InstalledAddon } from "../domain/types";
import { api, ApiClientError } from "../lib/api";
import { monotonicIso } from "../lib/iso";
import { Outbox, readJson, userKey, writeJson } from "./persist";

export const CINEMETA_MANIFEST_URL = "https://v3-cinemeta.strem.io/manifest.json";

/** The synced shape (user_addons row). `manifestJson` is echoed back verbatim so nothing an addon declares is lost in a round trip. */
interface AddonDto {
  manifestUrl: string;
  addonId: string;
  name: string;
  manifestJson: Record<string, unknown>;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
  deletedAt?: string | null;
}

/** InstalledAddon plus the untouched manifest JSON it came from. */
export interface StoredAddon extends InstalledAddon {
  raw?: Record<string, unknown>;
}

function toDto(addon: StoredAddon, sortOrder: number, updatedAt: string): AddonDto {
  return { manifestUrl: addon.manifestUrl, addonId: addon.manifest.id, name: addon.manifest.name, manifestJson: addon.raw ?? (addon.manifest as unknown as Record<string, unknown>), enabled: addon.enabled, sortOrder, updatedAt };
}

function fromDto(dto: AddonDto): StoredAddon | null {
  try {
    return { manifestUrl: dto.manifestUrl, manifest: normalizeManifest(dto.manifestJson), enabled: dto.enabled, raw: dto.manifestJson };
  } catch {
    return null;
  }
}

interface AddonsState {
  userId: string | null;
  addons: StoredAddon[];
  /** False until the addon list is known — from this browser's cache, or after the first attempt to fetch it from the account. Screens wait for it instead of flashing "no addons". */
  ready: boolean;
  hydrate(userId: string): void;
  reset(): void;
  install(rawUrl: string): Promise<StoredAddon>;
  remove(manifestUrl: string): void;
  setEnabled(manifestUrl: string, enabled: boolean): void;
  pull(): Promise<{ ok: boolean; empty: boolean }>;
  retryPending(): Promise<void>;
  /** A brand-new account (everything empty in the cloud) gets the same default a fresh TV gets: Cinemeta. */
  bootstrapDefault(): void;
  /** Visitors without an account browse with the default addon (Cinemeta); nothing is stored or synced. */
  loadGuestDefault(): void;
}

let outbox: Outbox<AddonDto> | null = null;

export const useAddons = create<AddonsState>((set, get) => {
  function commit(addons: StoredAddon[]) {
    set({ addons });
    const uid = get().userId;
    if (uid) writeJson(userKey(uid, "addons"), addons);
    useProviders.getState().replaceAll(addons.filter((a) => a.enabled).map((a) => new StremioAddonProvider(a.manifestUrl, a.manifest)));
  }

  function reconcile(dto: AddonDto) {
    const current = get().addons;
    const matches = (a: StoredAddon) => a.manifestUrl === dto.manifestUrl;
    if (dto.deletedAt) return commit(current.filter((a) => !matches(a)));
    const addon = fromDto(dto);
    if (!addon) return;
    commit(current.some(matches) ? current.map((a) => (matches(a) ? addon : a)) : [...current, addon]);
  }

  async function pushUpsert(dto: AddonDto) {
    try {
      reconcile(await api<AddonDto>("/user/addons", { method: "POST", body: dto }));
      outbox?.remove(dto.manifestUrl);
    } catch {
      outbox?.put(dto.manifestUrl, dto);
    }
  }

  async function pushRemove(manifestUrl: string, updatedAt: string) {
    const pending: AddonDto = { manifestUrl, addonId: "", name: "", manifestJson: {}, enabled: false, sortOrder: 0, updatedAt, deletedAt: updatedAt };
    try {
      const query = new URLSearchParams({ manifestUrl, updatedAt });
      const response = await api<AddonDto | undefined>(`/user/addons?${query}`, { method: "DELETE" });
      if (response) reconcile(response);
      outbox?.remove(manifestUrl);
    } catch {
      outbox?.put(manifestUrl, pending);
    }
  }

  return {
    userId: null,
    addons: [],
    ready: false,

    hydrate(userId) {
      outbox = new Outbox<AddonDto>(userId, "addons");
      const stored = readJson<StoredAddon[]>(userKey(userId, "addons"), []);
      set({ userId, addons: stored, ready: stored.length > 0 });
      useProviders.getState().replaceAll(stored.filter((a) => a.enabled).map((a) => new StremioAddonProvider(a.manifestUrl, a.manifest)));
    },
    reset() {
      outbox = null;
      clearAddonCache();
      set({ userId: null, addons: [], ready: false });
      useProviders.getState().replaceAll([]);
    },

    async install(rawUrl) {
      if (rawUrl.trim() === "") throw new Error("Enter an addon URL first.");
      const manifestUrl = normalizeManifestUrl(rawUrl);
      const { manifest, raw } = await fetchManifest(manifestUrl);
      const addon: StoredAddon = { manifestUrl, manifest, enabled: true, raw };
      const rest = get().addons.filter((a) => a.manifestUrl !== manifestUrl);
      commit([...rest, addon]);
      void pushUpsert(toDto(addon, get().addons.length - 1, monotonicIso(`addon|${manifestUrl}`)));
      return addon;
    },

    remove(manifestUrl) {
      if (!get().addons.some((a) => a.manifestUrl === manifestUrl)) return;
      commit(get().addons.filter((a) => a.manifestUrl !== manifestUrl));
      void pushRemove(manifestUrl, monotonicIso(`addon|${manifestUrl}`));
    },

    setEnabled(manifestUrl, enabled) {
      const addon = get().addons.find((a) => a.manifestUrl === manifestUrl);
      if (!addon) return;
      const updated = { ...addon, enabled };
      commit(get().addons.map((a) => (a.manifestUrl === manifestUrl ? updated : a)));
      void pushUpsert(toDto(updated, get().addons.findIndex((a) => a.manifestUrl === manifestUrl), monotonicIso(`addon|${manifestUrl}`)));
    },

    async pull() {
      try {
        const { items } = await api<{ items: AddonDto[] }>("/user/addons");
        const pending = outbox?.all() ?? {};
        const remote = items.map(fromDto).filter((a): a is StoredAddon => a !== null).filter((a) => !(a.manifestUrl in pending));
        const localPending = get().addons.filter((a) => a.manifestUrl in pending && !pending[a.manifestUrl]?.deletedAt);
        // cloud order is authoritative (sort_order); unsynced local changes stay put until retryPending lands them
        commit([...remote, ...localPending]);
        set({ ready: true });
        return { ok: true, empty: items.length === 0 };
      } catch {
        set({ ready: true });
        return { ok: false, empty: false };
      }
    },

    async retryPending() {
      for (const [key, dto] of Object.entries(outbox?.all() ?? {})) {
        try {
          if (dto.deletedAt) {
            const response = await api<AddonDto | undefined>(`/user/addons?${new URLSearchParams({ manifestUrl: dto.manifestUrl, updatedAt: dto.updatedAt })}`, { method: "DELETE" });
            if (response) reconcile(response);
          } else reconcile(await api<AddonDto>("/user/addons", { method: "POST", body: dto }));
          outbox?.remove(key);
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.isNetwork)) return;
        }
      }
    },

    loadGuestDefault() {
      outbox = null;
      // Visitors browse with the built-in catalog when this server has one; otherwise with Cinemeta. Nothing is stored or synced either way.
      const { builtin, builtinEnabled } = useProviders.getState();
      if (builtin && builtinEnabled) {
        set({ userId: null, addons: [], ready: true });
        useProviders.getState().replaceAll([]);
        return;
      }
      const raw = cinemetaManifest as unknown as Record<string, unknown>;
      const addon: StoredAddon = { manifestUrl: CINEMETA_MANIFEST_URL, manifest: normalizeManifest(raw), enabled: true, raw };
      set({ userId: null, addons: [addon], ready: true });
      useProviders.getState().replaceAll([new StremioAddonProvider(addon.manifestUrl, addon.manifest)]);
    },

    bootstrapDefault() {
      const userId = get().userId;
      if (!userId || get().addons.length > 0) return;
      const flag = userKey(userId, "defaultAddonBootstrapped");
      if (readJson<boolean>(flag, false)) return;
      writeJson(flag, true);
      const raw = cinemetaManifest as unknown as Record<string, unknown>;
      const addon: StoredAddon = { manifestUrl: CINEMETA_MANIFEST_URL, manifest: normalizeManifest(raw), enabled: true, raw };
      commit([addon]);
      void pushUpsert(toDto(addon, 0, monotonicIso(`addon|${CINEMETA_MANIFEST_URL}`)));
    },
  };
});
