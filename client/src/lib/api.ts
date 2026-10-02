/**
 * Browser → web server client. Same-origin only; the session lives in an httpOnly
 * cookie the page cannot read, so there is no token handling here at all.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
/** Called once when any /api call proves the session is over (revoked, or refresh token expired). */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Let the request outlive the page (final progress report on tab close). */
  keepalive?: boolean;
  /** Don't treat a 401 as "session expired" (used by the sign-in form itself). */
  authFlow?: boolean;
  /** Extra request headers (a profile's PIN when changing or removing a locked profile). */
  headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  let body: string | undefined;
  if (method !== "GET") headers["X-MangoTV-Client"] = "web";
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body, credentials: "same-origin", signal: options.signal, keepalive: options.keepalive });
  } catch (cause) {
    if ((cause as { name?: string }).name === "AbortError") throw cause;
    throw new ApiClientError(0, "network", "Can't reach ArcTV right now. Check your connection.");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (response.ok) return json as T;

  const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
  const retry = Number(response.headers.get("retry-after")) || undefined;
  const error = new ApiClientError(response.status, err?.code ?? "error", err?.message ?? `Request failed (${response.status})`, retry);
  if (response.status === 401 && !options.authFlow && (error.code === "session_expired" || error.code === "unauthorized")) {
    sessionExpiredListeners.forEach((listener) => listener());
  }
  throw error;
}
