import type { Response } from "express";

/** Every non-2xx response from this server has the same shape. */
export type ErrorCode =
  | "unauthorized"
  | "session_expired"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "validation"
  | "invalid_credentials"
  | "email_taken"
  | "rate_limited"
  | "backend_unavailable"
  | "upstream_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function sendError(res: Response, error: ApiError): void {
  if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
  res.status(error.status).json({ error: { code: error.code, message: error.message } });
}

/** Maps a status returned by the existing MangoTV API onto our error shape, preserving its message. */
export function fromBackendStatus(status: number, message: string | undefined, retryAfter?: string | null): ApiError {
  const text = message && message.length < 300 ? message : undefined;
  const retry = retryAfter ? Math.max(1, Math.min(3600, Number(retryAfter) || 60)) : undefined;
  switch (status) {
    case 400:
      return new ApiError(400, "validation", text ?? "The request was not valid.");
    case 401:
      return new ApiError(401, "invalid_credentials", text ?? "Unauthorized");
    case 403:
      return new ApiError(403, "forbidden", text ?? "Forbidden");
    case 404:
      return new ApiError(404, "not_found", text ?? "Not found");
    case 409:
      return new ApiError(409, "email_taken", text ?? "An account with that email already exists");
    case 429:
      return new ApiError(429, "rate_limited", "Too many requests right now. Please wait a moment and try again.", retry ?? 30);
    default:
      return new ApiError(status >= 500 ? 502 : status, "upstream_error", "The MangoTV service had a problem. Please try again.");
  }
}
