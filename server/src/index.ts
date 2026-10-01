import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`ArcTV Web listening on :${config.port} → API ${config.apiUrl} (${config.nodeEnv})`);
});

// Graceful shutdown for PaaS redeploys (SIGTERM on restart).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
