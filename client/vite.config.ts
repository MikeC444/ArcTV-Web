import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In development the SPA runs on :5173 and proxies /api to the web server
// (default :8080), so the browser only ever talks to one origin — exactly like
// production, where the web server serves the built SPA itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.WEB_SERVER_URL ?? "http://localhost:8080", changeOrigin: false } },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
