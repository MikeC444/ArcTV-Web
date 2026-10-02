import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { backendMessage } from "../backend.js";
import { authedBackendRequest, type AppContext } from "../context.js";
import { ApiError, fromBackendStatus, sendError } from "../errors.js";

/**
 * Profiles (an ArcTV Plus feature): up to PROFILE_LIMIT per account, each with its own library (My List, Continue Watching, history,
 * settings, addons, taste feedback). The account's profile list lives in the backend (`/user/profiles`, see docs/PROFILES.md); what this
 * server adds is the part a browser must not be trusted with:
 *
 *  - which profile this browser is using is kept in the sealed session cookie, set here only after the Plus check and (for a PIN-locked
 *    profile) a PIN check, and sent to the backend as X-ArcTV-Profile by `authedBackendRequest` — never taken from the browser's request;
 *  - changing or removing a PIN-locked profile needs its PIN too.
 */
export const PROFILE_LIMIT = 5;
export const DEFAULT_PROFILE_ID = "main";

export const AVATARS = ["sunrise", "ocean", "forest", "violet", "ember", "mint", "astro", "monster", "fox", "robot", "wave", "bolt"] as const;

const pin = z.string().regex(/^\d{4}$/, "A PIN is 4 digits.");
const name = z.string().trim().min(1, "Give the profile a name.").max(24, "Profile names are at most 24 characters.");
const profileId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const createBody = z.object({ name, avatar: z.enum(AVATARS), kind: z.enum(["adult", "kids"]), pin: pin.optional() }).strict();
const updateBody = z.object({ name: name.optional(), avatar: z.enum(AVATARS).optional(), kind: z.enum(["adult", "kids"]).optional(), pin: pin.nullable().optional() }).strict();
const selectBody = z.object({ profileId, pin: pin.optional() }).strict();

interface ProfileDto {
  id: string;
  name: string;
  avatar: string;
  kind: "adult" | "kids";
  hasPin: boolean;
  isDefault: boolean;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "validation", result.error.issues.map((i) => i.message).join(" "));
  return result.data;
}

function isProfile(value: unknown): value is ProfileDto {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.avatar === "string" && (p.kind === "adult" || p.kind === "kids") && typeof p.hasPin === "boolean" && typeof p.isDefault === "boolean";
}

const limiter = (limit: number) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, new ApiError(429, "rate_limited", "Too many attempts. Please wait a minute and try again.", 60)),
  });

export function createProfilesRouter(ctx: AppContext): Router {
  const router = Router();
  const backend = (req: Request, res: Response, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) => authedBackendRequest(ctx, req, res, { method, path: `/user/profiles${path}`, body });

  /** The account's profiles. `null` when the backend predates profiles (it answers 404): the app then keeps its single implicit profile. */
  async function list(req: Request, res: Response): Promise<ProfileDto[] | null> {
    const response = await backend(req, res, "GET", "");
    if (response.status === 404) return null;
    if (response.status !== 200) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    const raw = (response.json as { profiles?: unknown } | undefined)?.profiles;
    if (!Array.isArray(raw)) throw new ApiError(502, "upstream_error", "The ArcTV service returned an unexpected response.");
    return raw.filter(isProfile);
  }

  async function hasPlus(req: Request, res: Response): Promise<boolean> {
    const response = await authedBackendRequest(ctx, req, res, { method: "GET", path: "/user/plus" });
    return response.status === 200 && (response.json as { active?: unknown } | undefined)?.active === true;
  }

  async function requirePlus(req: Request, res: Response): Promise<void> {
    if (!(await hasPlus(req, res))) throw new ApiError(403, "plus_required", "Profiles are part of ArcTV Plus.");
  }

  /** A locked profile asks for its PIN before it can be opened, changed or removed. */
  async function checkPin(req: Request, res: Response, profile: ProfileDto, given: string | undefined): Promise<void> {
    if (!profile.hasPin) return;
    if (!given) throw new ApiError(403, "pin_required", "Enter this profile's PIN.");
    const response = await backend(req, res, "POST", `/${encodeURIComponent(profile.id)}/verify-pin`, { pin: given });
    if (response.status === 200 || response.status === 204) return;
    if (response.status === 403) throw new ApiError(403, "wrong_pin", "That PIN isn't right.");
    throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
  }

  const headerPin = (req: Request): string | undefined => {
    const value = req.headers["x-arctv-pin"];
    if (typeof value !== "string" || value === "") return undefined;
    return parse(pin, value);
  };

  async function find(req: Request, res: Response, id: string): Promise<{ profiles: ProfileDto[]; profile: ProfileDto }> {
    const profiles = await list(req, res);
    const profile = profiles?.find((p) => p.id === id);
    if (!profiles || !profile) throw new ApiError(404, "not_found", "That profile doesn't exist.");
    return { profiles, profile };
  }

  /** ensureFresh, not read: an earlier call in this same request may already have rotated the tokens, and the cookie written here must carry the new ones. */
  const setActive = async (req: Request, res: Response, id: string | undefined) => {
    const session = await ctx.sessions.ensureFresh(req, res);
    if (!session) return;
    const { pf: _old, ...rest } = session;
    ctx.sessions.write(res, id ? { ...rest, pf: id } : rest);
  };

  router.get("/", async (req, res) => {
    const profiles = await list(req, res);
    if (!profiles) {
      res.json({ supported: false, plus: false, limit: PROFILE_LIMIT, profiles: [], active: DEFAULT_PROFILE_ID });
      return;
    }
    const plus = await hasPlus(req, res);
    const defaultId = profiles.find((p) => p.isDefault)?.id ?? DEFAULT_PROFILE_ID;
    // Without Plus only the account's own profile is usable, and a browser left on another one (Plus lapsed, profile deleted elsewhere) goes back to it.
    const visible = plus ? profiles : profiles.filter((p) => p.isDefault);
    const chosen = ctx.sessions.read(req)?.pf;
    const active = chosen && visible.some((p) => p.id === chosen) ? chosen : defaultId;
    if (chosen && active !== chosen) await setActive(req, res, undefined);
    res.json({ supported: true, plus, limit: PROFILE_LIMIT, profiles: visible, active });
  });

  router.post("/", async (req, res) => {
    const body = parse(createBody, req.body);
    await requirePlus(req, res);
    const profiles = await list(req, res);
    if (!profiles) throw new ApiError(404, "not_found", "Profiles aren't available yet.");
    if (profiles.length >= PROFILE_LIMIT) throw new ApiError(400, "validation", `An account can have up to ${PROFILE_LIMIT} profiles.`);
    const response = await backend(req, res, "POST", "", body);
    if (response.status !== 200 && response.status !== 201) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    res.status(201).json({ profile: response.json });
  });

  router.put("/:id", async (req, res) => {
    const id = parse(profileId, req.params.id);
    const body = parse(updateBody, req.body);
    await requirePlus(req, res);
    const { profile } = await find(req, res, id);
    if (profile.isDefault && body.kind === "kids") throw new ApiError(400, "validation", "The account's own profile can't be a kids profile.");
    await checkPin(req, res, profile, headerPin(req));
    const response = await backend(req, res, "PUT", `/${encodeURIComponent(id)}`, body);
    if (response.status !== 200) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    res.json({ profile: response.json });
  });

  router.delete("/:id", async (req, res) => {
    const id = parse(profileId, req.params.id);
    await requirePlus(req, res);
    const { profile } = await find(req, res, id);
    if (profile.isDefault) throw new ApiError(400, "validation", "The account's own profile can't be removed.");
    await checkPin(req, res, profile, headerPin(req));
    const response = await backend(req, res, "DELETE", `/${encodeURIComponent(id)}`);
    if (response.status !== 200 && response.status !== 204) throw fromBackendStatus(response.status, backendMessage(response.json), response.retryAfter);
    if (ctx.sessions.read(req)?.pf === id) await setActive(req, res, undefined);
    res.status(204).end();
  });

  /** Opens a profile for this browser: the Plus check (for any profile but the account's own) and the PIN check happen here. */
  router.post("/select", limiter(10), async (req, res) => {
    const body = parse(selectBody, req.body);
    const { profile } = await find(req, res, body.profileId);
    if (!profile.isDefault) await requirePlus(req, res);
    await checkPin(req, res, profile, body.pin);
    await setActive(req, res, profile.isDefault ? undefined : profile.id);
    res.json({ profile });
  });

  return router;
}
