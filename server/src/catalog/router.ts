import { Router, type NextFunction, type Request, type Response } from "express";
import { CatalogService, type CatalogExtra } from "./addon.js";
import { TmdbError } from "./tmdb.js";

/** Stremio's "extra" path segment: `genre=Action&skip=100` (values percent-encoded). */
export function parseExtra(segment: string | undefined): CatalogExtra {
  const extra: CatalogExtra = {};
  if (!segment) return extra;
  for (const pair of segment.split("&")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    let name: string;
    let value: string;
    try {
      name = decodeURIComponent(pair.slice(0, at));
      value = decodeURIComponent(pair.slice(at + 1));
    } catch {
      continue;
    }
    if (name === "genre" && value.length <= 40) extra.genre = value;
    else if (name === "search" && value.trim() !== "" && value.length <= 100) extra.search = value.trim();
    else if (name === "skip" && /^\d{1,5}$/.test(value)) extra.skip = Math.min(Number(value), 9900);
  }
  return extra;
}

/**
 * Serves the built-in catalog addon at /addon/… — a real Stremio addon (manifest, catalog, meta), open to every browser and
 * to other Stremio apps. It needs no account: it holds public movie / TV data only.
 */
export function createCatalogRouter(service: CatalogService, rateLimiter: (req: Request, res: Response, next: NextFunction) => void): Router {
  const router = Router();
  router.use(rateLimiter);
  router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  router.get("/manifest.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(service.manifest());
  });

  const sendCatalog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = String(req.params.type);
      const id = String(req.params.id);
      const extra = parseExtra(typeof req.params.extra === "string" ? req.params.extra : undefined);
      const answer = await service.catalog(type, id, extra);
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(answer);
    } catch (error) {
      failed(res, error, next);
    }
  };
  router.get("/catalog/:type/:id.json", sendCatalog);
  router.get("/catalog/:type/:id/:extra.json", sendCatalog);

  router.get("/meta/:type/:id.json", async (req, res, next) => {
    try {
      const answer = await service.meta(String(req.params.type), String(req.params.id));
      if (!answer) {
        res.status(404).json({ err: "not found" });
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(answer);
    } catch (error) {
      failed(res, error, next);
    }
  });

  router.use((_req, res) => {
    res.status(404).json({ err: "not found" });
  });
  return router;
}

/** TMDB trouble is a 502 for the caller (the web app just treats that addon as unavailable for now); anything else is a bug and goes to the error handler. */
function failed(res: Response, error: unknown, next: NextFunction): void {
  if (error instanceof TmdbError) {
    res.status(502).json({ err: "The movie database is not answering right now." });
    return;
  }
  next(error);
}
