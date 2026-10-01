import { create } from "zustand";
import type { CatalogProvider } from "./provider";

/**
 * Runtime registry of installed catalog providers (data/provider/ProviderRegistry.kt). Starts empty — Home shows
 * its empty state until an addon exists; there's no built-in placeholder content.
 */
interface RegistryState {
  providers: CatalogProvider[];
  /** Replaces everything at once. A no-op when the provider ids are unchanged, so a server pull that just confirms the local list doesn't re-trigger every screen's catalog fetch. */
  replaceAll(providers: CatalogProvider[]): void;
}

export const useProviders = create<RegistryState>((set, get) => ({
  providers: [],
  replaceAll(next) {
    const current = get().providers;
    if (current.length === next.length && current.every((p, i) => p.id === next[i]?.id)) return;
    set({ providers: next });
  },
}));

export const activeProviders = (): CatalogProvider[] => useProviders.getState().providers;
