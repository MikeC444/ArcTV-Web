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
  /** True once we know whether this server offers the built-in catalog (screens wait for it so rows don't arrive in two waves). */
  builtinChecked: boolean;
  /** Replaces the person's addons at once. A no-op when the provider ids are unchanged, so a server pull that just confirms the local list doesn't re-trigger every screen's catalog fetch. */
  replaceAll(providers: CatalogProvider[]): void;
  setBuiltin(provider: CatalogProvider | null): void;
  markBuiltinChecked(): void;
}

const combine = (own: CatalogProvider[], builtin: CatalogProvider | null): CatalogProvider[] => (builtin && !own.some((p) => p.id === builtin.id) ? [...own, builtin] : own);
const sameIds = (a: CatalogProvider[], b: CatalogProvider[]) => a.length === b.length && a.every((p, i) => p.id === b[i]?.id);

export const useProviders = create<RegistryState & { own: CatalogProvider[] }>((set, get) => ({
  providers: [],
  own: [],
  builtin: null,
  builtinChecked: false,
  replaceAll(next) {
    const { builtin, providers } = get();
    const combined = combine(next, builtin);
    set(sameIds(providers, combined) ? { own: next } : { own: next, providers: combined });
  },
  setBuiltin(provider) {
    const { own, providers } = get();
    const combined = combine(own, provider);
    set(sameIds(providers, combined) ? { builtin: provider } : { builtin: provider, providers: combined });
  },
  markBuiltinChecked() {
    set({ builtinChecked: true });
  },
}));

export const activeProviders = (): CatalogProvider[] => useProviders.getState().providers;
