import { api } from "../lib/api";
import type { ContentType } from "../domain/types";

/** What the developer panel's Downloads card counts (POST /user/player-events/download). No title, content id or file address is sent. */
export interface DownloadEvent {
  kind: "popup" | "opened" | "file";
  contentType: ContentType;
  episode: boolean;
  resolution?: string | null;
  cached?: boolean | null;
}

/** Fire-and-forget: a failed report is ignored and never gets in the way of the download. */
export function reportDownloadEvent(event: DownloadEvent): void {
  void api("/user/player-events/download", { method: "POST", body: event, keepalive: true }).catch(() => undefined);
}
