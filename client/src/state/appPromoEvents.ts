import { api } from "../lib/api";

/** What the developer panel's "App popups" view counts (POST /user/player-events/app-promo). Only which app and what the person did: nothing else is sent. */
export interface AppPromoEvent {
  app: "mac" | "windows";
  kind: "shown" | "download" | "closed";
}

/** Fire-and-forget: a failed report is ignored and never gets in the way of the popup or the download. */
export function reportAppPromoEvent(event: AppPromoEvent): void {
  void api("/user/player-events/app-promo", { method: "POST", body: event, keepalive: true }).catch(() => undefined);
}
