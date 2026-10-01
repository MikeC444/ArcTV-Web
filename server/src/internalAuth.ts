import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Short-lived tokens for this server's own helpers (ffmpeg, in audio compatibility mode) to call the stream relay over the loopback
 * interface as the person who asked — without handing a child process that person's session cookie, which would show up in the
 * process list. A token works only from a loopback address, only until it is revoked (when the helper exits) or expires.
 */
export const INTERNAL_HEADER = "x-mango-internal";
const TTL_MS = 6 * 3600_000;

export class InternalTokens {
  private readonly tokens = new Map<string, { userId: string; until: number }>();

  issue(userId: string): string {
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(token, { userId, until: Date.now() + TTL_MS });
    return token;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  /** Who a loopback request is acting for, or null. */
  userFor(req: Pick<IncomingMessage, "headers" | "socket">): string | null {
    const token = req.headers[INTERNAL_HEADER];
    if (typeof token !== "string") return null;
    const address = req.socket.remoteAddress ?? "";
    if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return null;
    const entry = this.tokens.get(token);
    if (!entry || entry.until <= Date.now()) return null;
    return entry.userId;
  }
}
