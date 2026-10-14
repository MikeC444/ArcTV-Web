/** The developer panel's "App popups" view: how the web app's Mac and Windows app popups are doing (see the backend's appPromoEventService). */
export type PromoApp = "mac" | "windows";
export type PromoKind = "shown" | "download" | "closed";

export interface AppPromoTotals {
  app: PromoApp;
  /** People the popup appeared for in the last 7 days. */
  shownPeople: number;
  /** People who pressed Get the app. */
  downloadPeople: number;
  /** People who closed it without pressing it. */
  closedPeople: number;
  shown: number;
  downloads: number;
  closes: number;
}

export interface AppPromoDay {
  date: string;
  mac: { shown: number; downloads: number };
  windows: { shown: number; downloads: number };
}
export interface AppPromoPerson {
  userId: string;
  email: string;
  displayName: string | null;
  app: PromoApp;
  /** The best thing they did: pressed the button, else closed it, else only saw it. */
  outcome: PromoKind;
  at: string;
}
export interface AppPromoRecent {
  app: PromoApp;
  kind: PromoKind;
  at: string;
  userId: string;
  email: string;
  displayName: string | null;
}
/** What GET /admin/app-promos returns. */
export interface AppPromoDetail {
  days: AppPromoDay[];
  people: AppPromoPerson[];
  recent: AppPromoRecent[];
}

export const APP_LABEL: Record<PromoApp, string> = { mac: "Mac app", windows: "Windows app" };
export const OUTCOME_LABEL: Record<PromoKind, string> = { download: "Pressed Get the app", closed: "Closed it", shown: "Saw it, no choice yet" };

export function describePromoEvent(e: Pick<AppPromoRecent, "app" | "kind">): string {
  const app = APP_LABEL[e.app];
  return e.kind === "shown" ? `Was shown the ${app} popup` : e.kind === "download" ? `Pressed Get the ${app}` : `Closed the ${app} popup`;
}
