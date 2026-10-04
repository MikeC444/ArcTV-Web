import { Router } from "express";
import { authedBackendRequest, type AppContext } from "../context.js";
import { ApiError, fromBackendStatus } from "../errors.js";
import { backendMessage } from "../backend.js";

/**
 * The developer panel's data, read-only: three GET paths and nothing else. The backend decides who may see it (an account flagged
 * is_admin); anyone else gets its 404. This proxy only adds the sealed-cookie bearer, like /api/user.
 */
const ALLOWED = [/^\/summary$/, /^\/users$/, /^\/users\/[0-9a-fA-F-]{36}$/];

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(async (req, res) => {
    if (req.method !== "GET" || !ALLOWED.some((re) => re.test(req.path))) throw new ApiError(404, "not_found", "Not found");
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
    if (query.length > 512) throw new ApiError(400, "bad_request", "Query too long.");
    const response = await authedBackendRequest(ctx, req, res, { method: "GET", path: `/admin${req.path}`, query });
    if (response.status >= 400) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    res.json(response.json);
  });
  return router;
}
