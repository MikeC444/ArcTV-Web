import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * All runtime configuration comes from environment variables. Nothing here is
 * a database credential: this server never talks to Postgres — it only talks
 * to the existing MangoTV API (MANGOTV_API_URL), which is the only component
 * that holds DATABASE_URL.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MANGOTV_API_URL: z
    .string()
    .url("MANGOTV_API_URL must be an absolute URL")
    .transform((value) => value.replace(/\/+$/, "")),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters").optional(),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  CSP_EXTRA_CONNECT_SRC: z.string().default(""),
  STATIC_DIR: z.string().optional(),
  // Test-only escape hatch: allow the addon proxy to reach loopback/private hosts.
  ALLOW_PRIVATE_ADDON_HOSTS: z.enum(["0", "1"]).default("0"),
  // Stream relay (see streamRelay.ts): "0" turns it off entirely. On by default; the player only uses it when a stream can't be played directly.
  STREAM_RELAY: z.enum(["0", "1"]).default("1"),
  // Audio compatibility mode (see transcode.ts): converts Dolby / DTS audio to stereo AAC / Opus for devices that can't play it. "0" turns it off.
  AUDIO_CONVERSION: z.enum(["0", "1"]).default("1"),
  FFMPEG_PATH: z.string().trim().min(1).optional(),
  AUDIO_CONVERSION_MAX: z.coerce.number().int().min(1).max(32).default(3),
  // Built-in catalog addon (see catalog/): needs a free TMDB key. Without one the addon is simply off and the app uses its other addons.
  TMDB_API_KEY: z.string().trim().min(1).optional(),
  TMDB_API_BASE: z.string().url().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE: z.string().url().default("https://image.tmdb.org/t/p"),
});

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  port: number;
  apiUrl: string;
  sessionSecret: string;
  trustProxy: boolean;
  extraConnectSrc: string[];
  staticDir: string | undefined;
  allowPrivateAddonHosts: boolean;
  streamRelay: boolean;
  audioConversion: boolean;
  ffmpegPath: string | undefined;
  audioConversionMax: number;
  /** Undefined = the built-in catalog addon is off. */
  tmdbApiKey: string | undefined;
  tmdbApiBase: string;
  tmdbImageBase: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid configuration — ${problems}. See .env.example.`);
  }
  const value = parsed.data;
  const isProduction = value.NODE_ENV === "production";
  if (isProduction && !value.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production. Generate one with: openssl rand -base64 48");
  }
  if (isProduction && !value.MANGOTV_API_URL.startsWith("https://")) {
    throw new Error("MANGOTV_API_URL must be https:// in production — bearer tokens are sent to it.");
  }
  return {
    nodeEnv: value.NODE_ENV,
    isProduction,
    port: value.PORT,
    apiUrl: value.MANGOTV_API_URL,
    // In development/test a random per-process secret is fine (sessions just don't survive a restart).
    sessionSecret: value.SESSION_SECRET ?? cryptoRandom(),
    trustProxy: value.TRUST_PROXY === "1",
    extraConnectSrc: value.CSP_EXTRA_CONNECT_SRC.split(",").map((s) => s.trim()).filter(Boolean),
    staticDir: value.STATIC_DIR,
    allowPrivateAddonHosts: value.ALLOW_PRIVATE_ADDON_HOSTS === "1",
    streamRelay: value.STREAM_RELAY === "1",
    audioConversion: value.AUDIO_CONVERSION === "1",
    ffmpegPath: value.FFMPEG_PATH,
    audioConversionMax: value.AUDIO_CONVERSION_MAX,
    tmdbApiKey: value.TMDB_API_KEY,
    tmdbApiBase: value.TMDB_API_BASE.replace(/\/+$/, ""),
    tmdbImageBase: value.TMDB_IMAGE_BASE.replace(/\/+$/, ""),
  };
}

function cryptoRandom(): string {
  return randomBytes(32).toString("base64");
}
