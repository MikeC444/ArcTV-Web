import { useAddons } from "./addons";
import { useAuth } from "./auth";
import { useContinueWatching } from "./continueWatching";
import { useMyList } from "./myList";
import { wipeUser } from "./persist";
import { useSettings } from "./settings";

/**
 * SyncManager + AccountSwitchCoordinator. Pull on sign-in / launch, push immediately on local change (each store
 * does that itself and queues to a per-user outbox on failure), retry queued writes when the browser comes back
 * online and every 5 minutes, and — on explicit sign-out — flush what's queued (5 s budget), then wipe everything
 * local so the next person on this browser inherits nothing.
 */
const PERIODIC_RETRY_MS = 5 * 60_000;
const PRE_SIGN_OUT_FLUSH_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;

export function hydrateAll(userId: string): void {
  useSettings.getState().hydrate(userId);
  useMyList.getState().hydrate(userId);
  useContinueWatching.getState().hydrate(userId);
  useAddons.getState().hydrate(userId);
}

export async function retryPendingAll(): Promise<void> {
  await Promise.allSettled([
    useSettings.getState().retryPending(),
    useMyList.getState().retryPending(),
    useContinueWatching.getState().retryPending(),
    useAddons.getState().retryPending(),
  ]);
}

export async function syncAll(): Promise<void> {
  const [settings, watchlist, continueWatching, addons] = await Promise.all([
    useSettings.getState().pull(),
    useMyList.getState().pull(),
    useContinueWatching.getState().pull(),
    useAddons.getState().pull(),
  ]);
  await retryPendingAll();

  // A brand-new account — every cloud domain confirmed empty — starts with the same default addon a fresh TV gets.
  if (settings.ok && watchlist && continueWatching && addons.ok && settings.empty && addons.empty && useMyList.getState().items.length === 0 && useContinueWatching.getState().items.length === 0) {
    useAddons.getState().bootstrapDefault();
  }
  void useMyList.getState().backfillWatchedFromHistory();
}

export function startBackgroundSync(): void {
  stopBackgroundSync();
  onlineHandler = () => void retryPendingAll();
  window.addEventListener("online", onlineHandler);
  timer = setInterval(() => void retryPendingAll(), PERIODIC_RETRY_MS);
}

export function stopBackgroundSync(): void {
  if (onlineHandler) window.removeEventListener("online", onlineHandler);
  if (timer) clearInterval(timer);
  onlineHandler = null;
  timer = null;
}

/** Called once a session exists (login, QR, or a still-valid cookie at launch). */
export async function startSession(userId: string): Promise<void> {
  hydrateAll(userId);
  startBackgroundSync();
  await syncAll();
}

export function resetAllStores(): void {
  stopBackgroundSync();
  useSettings.getState().reset();
  useMyList.getState().reset();
  useContinueWatching.getState().reset();
  useAddons.getState().reset();
}

/** Explicit sign-out: flush → revoke → wipe. Never leaves this user's data or queued writes behind. */
export async function signOutAndWipe(): Promise<void> {
  const user = useAuth.getState().user;
  await Promise.race([retryPendingAll(), new Promise((resolve) => setTimeout(resolve, PRE_SIGN_OUT_FLUSH_MS))]);
  await useAuth.getState().signOutRemote();
  resetAllStores();
  if (user) wipeUser(user.id);
  useAuth.getState().markSignedOut();
}

/** The session ended involuntarily (expired/revoked). Keep this user's cache + outbox (namespaced) so the same person signing back in loses nothing. */
export function detachSession(): void {
  resetAllStores();
}
