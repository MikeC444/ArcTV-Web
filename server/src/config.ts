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
  };
}

function cryptoRandom(): string {
  return randomBytes(32).toString("base64");
}
