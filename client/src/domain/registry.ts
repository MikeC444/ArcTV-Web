import { create } from "zustand";
import type { CatalogProvider } from "./provider";

/**
 * Runtime registry of catalog providers (data/provider/ProviderRegistry.kt). Two sources feed it:
 *  - the person's own addons (`replaceAll`) — installed in their account, synced, theirs to change;
 *  - Mango TV's built-in catalog (`setBuiltin`) — the same for everybody, never written to an account and never shown as an
 *    installed addon. It is listed last, so nothing the person installed is displaced.
 * Starts empty — Home shows its empty state until some provider exists.
 */
interface RegistryState {
  /** What screens use: the person's addons, then the built-in catalog (if this server has one). */
  providers: CatalogProvider[];
  builtin: CatalogProvider | null;
  /** Whether this browser uses the built-in catalog (on unless the person turned it off here; kept on this device only, never in their account). */
  builtinEnabled: boolean;
  /** True once we know whether this server offers the built-in catalog (screens wait for it so rows don't arrive in two waves). */
  builtinChecked: boolean;
  /** Replaces the person's addons at once. A no-op when the provider ids are unchanged, so a server pull that just confirms the local list doesn't re-trigger every screen's catalog fetch. */
  replaceAll(providers: CatalogProvider[]): void;
  setBuiltin(provider: CatalogProvider | null): void;
  setBuiltinEnabled(enabled: boolean): void;
  markBuiltinChecked(): void;
}

const combine = (own: CatalogProvider[], builtin: CatalogProvider | null, enabled: boolean): CatalogProvider[] => (builtin && enabled && !own.some((p) => p.id === builtin.id) ? [...own, builtin] : own);

const OFF_KEY = "mtv:builtinCatalogOff";
const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(OFF_KEY) !== "1";
  } catch {
    return true;
  }
};
const writeEnabled = (enabled: boolean): void => {
  try {
    if (enabled) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, "1");
  } catch {
    /* storage unavailable — it just won't be remembered */
  }
};
const sameIds = (a: CatalogProvider[], b: CatalogProvider[]) => a.length === b.length && a.every((p, i) => p.id === b[i]?.id);

export const useProviders = create<RegistryState & { own: CatalogProvider[] }>((set, get) => ({
  providers: [],
  own: [],
  builtin: null,
  builtinEnabled: readEnabled(),
  builtinChecked: false,
  replaceAll(next) {
    const { builtin, builtinEnabled, providers } = get();
    const combined = combine(next, builtin, builtinEnabled);
    set(sameIds(providers, combined) ? { own: next } : { own: next, providers: combined });
  },
  setBuiltin(provider) {
    const { own, builtinEnabled, providers } = get();
    const combined = combine(own, provider, builtinEnabled);
    set(sameIds(providers, combined) ? { builtin: provider } : { builtin: provider, providers: combined });
  },
  setBuiltinEnabled(enabled) {
    writeEnabled(enabled);
    const { own, builtin, providers } = get();
    const combined = combine(own, builtin, enabled);
    set(sameIds(providers, combined) ? { builtinEnabled: enabled } : { builtinEnabled: enabled, providers: combined });
  },
  markBuiltinChecked() {
    set({ builtinChecked: true });
  },
}));

export const activeProviders = (): CatalogProvider[] => useProviders.getState().providers;
