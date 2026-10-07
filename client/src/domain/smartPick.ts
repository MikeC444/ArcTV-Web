import { deviceVerdict, type DeviceCaps } from "./deviceSupport";
import type { Stream } from "./types";

/**
 * ArcTV Plus "Smart source picking": the source to start without asking. That is the recommended one (the best resolution of what
 * this device can play, a plain file before an MKV, cached before not cached) — but only when the device's own check says it should
 * play here, so a doubtful pick never replaces the list. Null means "show the list".
 */
export function smartPickTarget(streams: readonly Stream[], recommendedId: string | null, caps?: DeviceCaps): Stream | null {
  const pick = recommendedId ? streams.find((s) => s.id === recommendedId) : undefined;
  if (!pick) return null;
  return deviceVerdict(pick, caps).level === "yes" ? pick : null;
}

/** Whether smart picking applies to this visit: Plus and switched on, and not when the person came back from the player or asked for the list. */
export function smartPickingApplies(opts: { plus: boolean; enabled: boolean; cameBack: boolean; skip: boolean }): boolean {
  return opts.plus && opts.enabled && !opts.cameBack && !opts.skip;
}
