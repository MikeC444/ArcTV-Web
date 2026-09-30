# Deploying MangoTV Web

MangoTV Web is **one Node service**: it serves the built single-page app and the small `/api` layer from the same
origin. It has no database of its own and needs no migration — it uses the MangoTV API that your Fire TV app already
uses, so every existing account works on day one.

```
users ──HTTPS──▶  MangoTV Web (this repo)  ──HTTPS──▶  your existing MangoTV API  ──▶  Neon
```

> The instructions below have been checked locally (`npm run build && npm start`, health check, deep links, security
> headers, sign-in against the real backend). They have **not** been run on a live hosting account, because none was
> available — expect to adapt the button labels of your provider.

## 1. Prerequisites

* The public **HTTPS base URL of your existing MangoTV API** — the same value your Fire TV build uses as
  `API_BASE_URL` (a GitHub secret / `local.properties` in the Firestick repository). It is not stored in either repository.
* A host that runs **Node 22.9+** and can keep one process running (Render, Railway, Fly.io, a VPS, a container platform…).
* A domain name with HTTPS (every provider above supplies TLS). The session cookie is `Secure` in production, so plain
  HTTP will not work.

You do **not** need the database URL, and the web service must never be given it.

## 2. Configure

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MANGOTV_API_URL` | `https://<your MangoTV API>` (no trailing slash; `https://` is enforced in production) |
| `SESSION_SECRET` | a long random string: `openssl rand -base64 48`. Store it as a secret, not in the repo. |
| `TRUST_PROXY` | `1` on nearly every PaaS (exactly one proxy in front). Use `0` if the Node process is exposed directly. |
| `PORT` | whatever the platform injects (default `8080`) |
| `CSP_EXTRA_CONNECT_SRC` | leave empty unless you need extra origins |
| `STREAM_RELAY` | `1` (default) or `0`. See "Stream relay" below. |

The server refuses to start in production without a valid `SESSION_SECRET` and an `https://` API URL.

## 3. Build and run

```bash
npm ci
npm run build      # client → client/dist, server → server/dist
npm start          # node server/dist/index.js  (serves the SPA + /api on $PORT)
```

* **Render / Railway / Heroku-style buildpacks** — Build command `npm ci --include=dev && npm run build`, start command
  `npm start`, health check path `/api/health`, set the environment variables above.
  **Use `--include=dev`:** these platforms expose environment variables (including `NODE_ENV=production`) to the build
  step too, and with `NODE_ENV=production` a plain `npm ci` / `npm install` skips the TypeScript and Vite tooling the
  build needs, so the build fails with `tsc`/`vite: not found`. (Verified from a fresh clone: the plain command fails,
  this one builds and starts.) Pin Node with `NODE_VERSION=22` if the platform picks an older one.
* **Fly.io / any container host** — use the same two commands in a `node:22-slim` image (copy the repo, `npm ci`,
  `npm run build`, `CMD ["npm","start"]`, expose `$PORT`).
* **VPS** — run `npm start` under systemd or pm2 behind nginx/Caddy that terminates TLS and forwards to `$PORT`
  (set `TRUST_PROXY=1`).

`GET /api/health` returns `{"status":"ok"}` (it does not call the backend).

## 4. First-run checklist

1. `MANGOTV_API_URL=https://… VERIFY_EMAIL=… VERIFY_PASSWORD=… npm run verify:backend` — confirms login, `/user/*`
   reads and logout against the real backend using a test account. Nothing is printed except statuses and counts.
2. Open the site, sign in with an **existing Fire TV account**. You should see its My List, Continue Watching and addons.
3. Change something in the browser (add a title to My List) and confirm it appears on the TV after its next sync — and
   the other way round.
4. Sign out and confirm you land on the welcome screen and the account's data is no longer visible in that browser.
5. Under *Settings → Addons*, confirm the account's addons (Cinemeta by default) load titles.
6. Check the response headers on `/` (`Content-Security-Policy`, `Strict-Transport-Security`) and that the
   `mtv_session` cookie is `HttpOnly; Secure; SameSite=Lax`.

## 5. Operating notes

### Rate limits

The existing API rate-limits per IP address (`/auth/*` 10 per minute, everything else 120 per minute) and trusts a single
proxy hop. From the backend's point of view every browser user is "the web server", so they share those buckets. The web
service forwards each visitor's real IP in `X-Forwarded-For` and applies its own per-IP limits in front, and it turns a
`429` from the backend into a friendly "try again in a moment" message — which is enough for a personal or family-sized
deployment.

For real scale the backend needs a small change (in the Firestick repository, which this project deliberately did not
modify): key the `/user/*` limiter on the authenticated user id (or the bearer token) instead of the IP, and make the
`/auth/*` limiter read the client IP the web service forwards (for example via an explicit trusted-proxy setting).
Until then, watch for `429` in the logs and keep the number of simultaneous new sign-ins per minute low.

### Stream relay (bandwidth)

Sources that need addon request headers, are plain `http://`, or whose host never answers a browser's own request are
played through `/api/relay/…` on this service (see [`PLAYBACK.md`](PLAYBACK.md)). Direct playback is always tried first,
so most viewing costs nothing, but **relayed video flows through this server** and counts against your host's bandwidth
(on a free Render plan that allowance is small, and free services are slower to stream). It is per-user capped at 6
simultaneous streams. The stream host (for example a debrid service) sees this server's IP address instead of the
viewer's. Set `STREAM_RELAY=0` to switch the relay off; the player then only ever requests streams directly.

### Scaling and restarts

* Run **one instance** if you can. Session state lives in the encrypted cookie, so several instances work, but refresh
  de-duplication is per process; two instances rotating the same refresh token at the same instant can force a user to
  sign in again.
* Restarting the service does **not** sign anyone out (as long as `SESSION_SECRET` is unchanged) and loses no data.
* Rotating `SESSION_SECRET` signs every browser out; accounts and their data are untouched.

### Data and rollback

* The web service writes nothing to any database itself. It calls the same endpoints as the TV.
* There is no migration to undo. To roll back, redeploy the previous build or take the service offline; the TV app is
  unaffected either way.
* Browser data (per-user cache and offline outbox in `localStorage`) is removed when the user signs out.

### Updating

`git pull && npm ci && npm run build && npm start` (or let your platform redeploy). Hashed assets are cached for a year;
`index.html` is served with `no-cache`, so a new build reaches users on their next visit.

### Monitoring

The service logs one line at start-up and nothing per request (no bodies, no tokens, no passwords). Add your platform's
request logging or uptime probe on `/api/health` as needed.

## 6. Security reminders

* Never commit `.env`; `.gitignore` already excludes `.env*` except `.env.example`.
* Never add `DATABASE_URL`, Neon credentials or the API's own signing/secret values to this service or to any
  `VITE_*`/public variable. They are not needed here and the client bundle contains no configuration at all.
* Payment verification (if payments are ever added to MangoTV) must run in the trusted backend; the web client must
  never decide that someone has paid.
