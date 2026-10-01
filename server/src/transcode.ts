import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { Router, type Request } from "express";
import type { AppContext } from "./context.js";
import { ApiError } from "./errors.js";
import { INTERNAL_HEADER } from "./internalAuth.js";
import { RELAY_PREFIX } from "./streamRelay.js";

/**
 * Audio compatibility mode.
 *
 * A browser plays the picture of most releases but not their sound when the audio is Dolby Digital / Dolby Digital Plus / DTS / TrueHD
 * (only Safari and a few others decode those). This route runs ffmpeg on the server: the VIDEO is copied untouched (cheap), the audio is
 * decoded and re-encoded as stereo AAC (MP4) — or Opus when the video is VP8 / VP9 / AV1, which MP4 players don't expect — and the
 * result is streamed to the browser as one progressive, fragmented file. The browser can't seek inside such a stream, so the player asks
 * again with `start=<seconds>` (ffmpeg seeks, near the nearest earlier keyframe, and the player adds that offset to its clock).
 *
 * ffmpeg never touches the internet by itself: it reads the source through this server's own relay (over the loopback interface, with
 * the caller's session cookie), so every protection of the relay — signed-in only, no private addresses, redirects re-checked, per-user
 * limits — applies unchanged. Backpressure is the throttle: when the browser stops reading, ffmpeg blocks on its output pipe.
 */
const MAX_SRC_LENGTH = 4096;
const FIRST_BYTE_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 25_000;
const IDLE_TIMEOUT_MS = 45_000;
const MAX_PER_USER = 2;
const MAX_START_SECONDS = 86_400;
const PROBE_CACHE_MS = 10 * 60_000;
const PROBE_CACHE_MAX = 200;
const STDERR_KEEP = 6_000;

export interface Probe {
  durationSeconds: number | null;
  /** First video stream's codec as ffmpeg names it ("h264", "hevc", "vp9" …). */
  video: string | null;
  audio: Array<{ codec: string; language: string | null }>;
  /** What the converted stream will be: MP4 + AAC, or WebM + Opus. */
  output: "mp4" | "webm";
}

/** The ffmpeg to use: the configured path, the one bundled by @ffmpeg-installer/ffmpeg, or `ffmpeg` on the PATH — whichever runs first. */
const resolved = new Map<string, string | null>();
export function resolveFfmpeg(configured?: string): string | null {
  const memo = resolved.get(configured ?? "");
  if (memo !== undefined) return memo;
  const found = findFfmpeg(configured);
  resolved.set(configured ?? "", found);
  return found;
}

function findFfmpeg(configured?: string): string | null {
  const candidates: string[] = [];
  if (configured) candidates.push(configured);
  try {
    const bundled = (createRequire(import.meta.url)("@ffmpeg-installer/ffmpeg") as { path?: string }).path;
    if (bundled) candidates.push(bundled);
  } catch {
    /* not installed for this platform */
  }
  candidates.push("ffmpeg");
  for (const candidate of candidates) {
    const run = spawnSync(candidate, ["-version"], { timeout: 5_000, stdio: "ignore" });
    if (run.status === 0) return candidate;
  }
  return null;
}

/** Reads what `ffmpeg -i <input>` prints about a file (it prints it to stderr, then complains there is no output). Exported for tests. */
export function parseProbe(stderr: string): Omit<Probe, "output"> {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationSeconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  let video: string | null = null;
  const audio: Probe["audio"] = [];
  for (const line of stderr.split("\n")) {
    const stream = /^\s*Stream #\d+:\d+(?:\[0x[0-9a-fA-F]+\])?(?:\(([^)]*)\))?: (Video|Audio): ([\w-]+)/.exec(line);
    if (!stream) continue;
    if (stream[2] === "Video" && video === null && !/attached pic/i.test(line)) video = stream[3]!.toLowerCase();
    if (stream[2] === "Audio") audio.push({ codec: stream[3]!.toLowerCase(), language: stream[1] && stream[1] !== "und" ? stream[1] : null });
  }
  return { durationSeconds: durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null, video, audio };
}

export const outputFor = (video: string | null): Probe["output"] => (video === "vp8" || video === "vp9" || video === "av1" ? "webm" : "mp4");

/** ffmpeg arguments for the converted stream. Exported for tests. */
export function transcodeArgs(input: string, headers: string, probe: Pick<Probe, "output">, options: { start: number; audio: number }): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-rw_timeout", "30000000", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5", "-headers", headers];
  if (options.start > 0) args.push("-ss", options.start.toFixed(3));
  args.push("-i", input, "-map", "0:v:0", "-map", `0:a:${options.audio}?`, "-sn", "-dn", "-c:v", "copy", "-ac", "2", "-avoid_negative_ts", "make_zero");
  if (probe.output === "webm") args.push("-c:a", "libopus", "-b:a", "160k", "-af", "aresample=async=1", "-f", "webm", "-live", "1", "-cluster_time_limit", "2000", "pipe:1");
  else args.push("-c:a", "aac", "-b:a", "192k", "-af", "aresample=async=1", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1");
  return args;
}

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function sourceOf(req: Request): string {
  const src = req.query.src;
  if (typeof src !== "string" || !src.startsWith(RELAY_PREFIX) || src.length > MAX_SRC_LENGTH || CONTROL_CHARS.test(src)) {
    throw new ApiError(400, "bad_request", "Not a valid stream address.");
  }
  return src;
}

function numberParam(value: unknown, name: string, max: number): number {
  if (value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ApiError(400, "bad_request", `Bad ${name}.`);
  return n;
}

export function createTranscodeRouter(ctx: AppContext, ffmpeg: string | null, limits: { maxSessions: number }): Router {
  const router = Router();
  const probes = new Map<string, { until: number; probe: Probe }>();
  const running = new Map<string, Set<ChildProcess>>(); // by user
  let total = 0;

  const requireUser = (req: Request): string => {
    if (!ffmpeg) throw new ApiError(404, "transcode_disabled", "Audio conversion isn't available on this server.");
    const session = ctx.sessions.read(req);
    if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");
    const site = req.headers["sec-fetch-site"];
    if (typeof site === "string" && site !== "same-origin") throw new ApiError(403, "forbidden", "Audio conversion only works from this site.");
    return session.user.id;
  };

  /** What ffmpeg reads from: this very server's relay over loopback, as the same signed-in person (by a token that dies with ffmpeg, not their cookie). */
  const inputFor = (req: Request, userId: string, src: string) => {
    const token = ctx.internal.issue(userId);
    return { input: `http://127.0.0.1:${req.socket.localPort}${src}`, headers: `${INTERNAL_HEADER}: ${token}\r\n`, token };
  };

  async function probe(req: Request, userId: string, src: string): Promise<Probe> {
    const key = createHash("sha256").update(`${userId}\n${src}`).digest("hex");
    const hit = probes.get(key);
    if (hit && hit.until > Date.now()) return hit.probe;
    const { input, headers, token } = inputFor(req, userId, src);
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(ffmpeg as string, ["-hide_banner", "-nostdin", "-rw_timeout", "20000000", "-headers", headers, "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
      let text = "";
      child.stderr.on("data", (chunk: Buffer) => {
        if (text.length < 40_000) text += chunk.toString("utf8");
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new ApiError(504, "upstream_error", "The source took too long to answer."));
      }, PROBE_TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        reject(new ApiError(502, "upstream_error", "Audio conversion couldn't start."));
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve(text);
      });
    }).finally(() => ctx.internal.revoke(token));
    const info = parseProbe(stderr);
    if (info.video === null && info.audio.length === 0) throw new ApiError(502, "upstream_error", "That source couldn't be read as video.");
    const result: Probe = { ...info, output: outputFor(info.video) };
    if (probes.size >= PROBE_CACHE_MAX) probes.delete(probes.keys().next().value as string);
    probes.set(key, { until: Date.now() + PROBE_CACHE_MS, probe: result });
    return result;
  }

  // What is in the source (length, audio tracks) — also how the player learns whether this server can convert at all.
  router.get("/info", async (req, res, next) => {
    try {
      const userId = requireUser(req);
      res.json(await probe(req, userId, sourceOf(req)));
    } catch (error) {
      next(error);
    }
  });

  // The converted stream itself.
  router.get("/", async (req, res, next) => {
    let counted = false;
    const release = () => {
      if (counted) total--;
      counted = false;
    };
    try {
      const userId = requireUser(req);
      const src = sourceOf(req);
      const start = numberParam(req.query.start, "start", MAX_START_SECONDS);
      const audio = Math.floor(numberParam(req.query.audio, "audio", 15));

      // a person's older conversions are what their player just replaced (a seek restarts it); keep at most MAX_PER_USER
      const mine = running.get(userId) ?? new Set<ChildProcess>();
      running.set(userId, mine);
      while (mine.size >= MAX_PER_USER) {
        const oldest = mine.values().next().value as ChildProcess;
        mine.delete(oldest);
        oldest.kill("SIGKILL");
      }
      if (total >= limits.maxSessions) throw new ApiError(503, "upstream_error", "Audio conversion is busy right now. Try again in a moment.", 10);

      const info = await probe(req, userId, src);
      const { input, headers, token } = inputFor(req, userId, src);
      const child = spawn(ffmpeg as string, transcodeArgs(input, headers, info, { start, audio }), { stdio: ["ignore", "pipe", "pipe"] });
      total++;
      counted = true;
      mine.add(child);
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_KEEP);
      });

      let started = false;
      let lastData = Date.now();
      child.stdout.on("data", () => {
        lastData = Date.now();
      });
      const finish = () => {
        clearTimeout(firstByte);
        clearInterval(watchdog);
        mine.delete(child);
        if (mine.size === 0) running.delete(userId);
        ctx.internal.revoke(token);
        release();
      };
      const firstByte = setTimeout(() => !started && child.kill("SIGKILL"), FIRST_BYTE_TIMEOUT_MS);
      // paused by backpressure (the browser has enough) is normal; silence while flowing means the source stalled
      const watchdog = setInterval(() => {
        if (started && child.stdout.readableFlowing !== false && Date.now() - lastData > IDLE_TIMEOUT_MS) child.kill("SIGKILL");
      }, 5_000);

      child.stdout.once("readable", () => {
        started = true;
        res.status(200);
        res.setHeader("Content-Type", info.output === "webm" ? "video/webm" : "video/mp4");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Accept-Ranges", "none");
        res.setHeader("X-Content-Type-Options", "nosniff");
        child.stdout.pipe(res);
      });
      child.on("error", () => {
        finish();
        if (!started && !res.headersSent) next(new ApiError(502, "upstream_error", "Audio conversion couldn't start."));
      });
      child.on("close", (code) => {
        finish();
        if (!started && !res.headersSent) {
          const said = stderr.replace(/https?:\/\/\S+/gi, "<link>").replace(/\s+/g, " ").trim().slice(-160);
          next(new ApiError(502, "upstream_error", `The source couldn't be converted${code ? ` (ffmpeg said: ${said || `exit ${code}`})` : ""}.`));
        }
      });
      res.on("close", () => child.kill("SIGKILL")); // the player went away (paused for good, seeked, left): stop converting
    } catch (error) {
      release();
      next(error);
    }
  });

  return router;
}
