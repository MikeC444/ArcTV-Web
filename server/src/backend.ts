import { ApiError } from "./errors.js";

/**
 * Thin HTTP client for the EXISTING MangoTV API. It carries the caller's bearer
 * token (never a database credential) and the real client IP so that the
 * backend's per-IP rate limiter can tell web clients apart where it is able to.
 */
export interface BackendResponse {
  status: number;
  /** Parsed JSON body, or undefined for empty / non-JSON bodies. */
  json: unknown;
  retryAfter: string | null;
}

export interface BackendRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // e.g. /user/settings
  query?: string; // raw query string without leading ?
  bearer?: string;
  body?: unknown;
  clientIp?: string;
  /** The profile the request is for (X-ArcTV-Profile). Absent = the account's default profile. */
  profileId?: string;
  timeoutMs?: number;
}

export type BackendFetch = (request: BackendRequest) => Promise<BackendResponse>;

export function createBackendClient(baseUrl: string, fetchImpl: typeof fetch = fetch): BackendFetch {
  return async (request) => {
    const url = `${baseUrl}${request.path}${request.query ? `?${request.query}` : ""}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "MangoTV-Web/0.1",
    };
    if (request.bearer) headers.Authorization = `Bearer ${request.bearer}`;
    if (request.clientIp) headers["X-Forwarded-For"] = request.clientIp;
    if (request.profileId) headers["X-ArcTV-Profile"] = request.profileId;
    let body: string | undefined;
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.body);
    }
    try {
      const response = await fetchImpl(url, {
        method: request.method,
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
      });
      const text = await response.text();
      let json: unknown;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      return { status: response.status, json, retryAfter: response.headers.get("retry-after") };
    } catch {
      throw new ApiError(502, "backend_unavailable", "Can't reach the MangoTV service right now.");
    }
  };
}

/** The backend reports errors as `{ error: "message" }`. */
export function backendMessage(json: unknown): string | undefined {
  if (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string") {
    return (json as { error: string }).error;
  }
  return undefined;
}
