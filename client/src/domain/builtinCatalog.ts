import { normalizeManifest } from "./stremio/client";
import { StremioAddonProvider } from "./provider";
import { useProviders } from "./registry";

/** The id of Mango TV's own catalog addon, served by the web server at /addon (server/src/catalog). */
export const BUILTIN_ADDON_ID = "tv.mango.catalog";
const CHECK_TIMEOUT_MS = 4000;

let check: Promise<void> | null = null;

/**
 * Asks this server whether it offers the built-in catalog (it does when a TMDB key is configured) and, if so, adds it to the
 * providers for everyone. Runs once per page load; screens wait for it (`builtinChecked`) so Home doesn't fill in twice.
 * Nothing here touches an account: no addon is installed for anyone, no setting changes.
 */
export function detectBuiltinCatalog(): Promise<void> {
  check ??= (async () => {
    try {
      const url = new URL("/addon/manifest.json", window.location.origin).toString();
      const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      if (!response.ok) return;
      const manifest = normalizeManifest(await response.json());
      if (manifest.id !== BUILTIN_ADDON_ID) return;
      useProviders.getState().setBuiltin(new StremioAddonProvider(url, manifest));
    } catch {
      /* not offered here, or not reachable right now: the person's own addons (or the default) carry on */
    } finally {
      useProviders.getState().markBuiltinChecked();
    }
  })();
  return check;
}
