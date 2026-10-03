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
| `TRUST_PROXY` | How many reverse proxies are in front: `0` (none — Node is exposed directly), `1` (a single proxy — many hosts), `2`/`3`. **Render and other platforms that put a CDN in front of their own proxy send two addresses**, so `1` would take the CDN's address for the visitor; the start-up log says which value fits (see below). |
| `PORT` | whatever the platform injects (default `8080`) |
| `CSP_EXTRA_CONNECT_SRC` | leave empty unless you need extra origins |
| `STREAM_RELAY` | `1` (default) or `0`. See "Stream relay" below. |
| `TMDB_API_KEY` | optional. A free key from themoviedb.org (Settings → API: the "API Key" or the "API Read Access Token"). With it, Detail shows cast photos and characters that Cinemeta doesn't send. Set it as a secret; it never reaches the browser. Without it the site works as before, with grey icons. |

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

**Is `TRUST_PROXY` right?** After a deploy, open the site once and read the service's log. You'll see one `[proxy]` line:
`X-Forwarded-For has N addresses and TRUST_PROXY=N … read correctly` means it matches. A warning saying it arrived with 2
addresses but `TRUST_PROXY=1` means the address used for every rate limit is a proxy's, shared by many visitors, so strangers
use up each other's sign-in allowance — set `TRUST_PROXY` to the number it names. Don't set it higher than the proxies actually
in front: a visitor could then fake their address and dodge the limits.

**Where a "too many attempts" came from.** The log has one `[auth]` line (at most one per 30 s, never an address or account) saying
whether *this server's* limit was reached (10 attempts a minute from one visitor address) or *the MangoTV service* answered 429
(its `/auth/*` limit, shared by everyone using this site — see below). That tells you which of the two to chase.

**"Too many requests right now" when signing in.** That wording is the *backend's* limiter answering (the web service's own
limiter says "Too many attempts. Please wait a minute…"). The backend allows **10 requests a minute to `/auth/*` per IP
address**, and sign-in, sign-up, token refresh and QR creation all count; to the backend every visitor of this site is the
same address. The sign-in form therefore shows the wait (from `Retry-After`) with a countdown and keeps its button off, and
the web service no longer re-sends a refresh the backend has just refused — it waits out `Retry-After` (a timeout or 5xx
pauses it for 5 s) so a slow or rate-limited backend can't be hammered by every page request of a signed-in tab. The
allowance refills within a minute. If it does **not**, something keeps calling the backend from this service: check the
backend's request log for a steady stream of `/auth/*` calls and which device they belong to. Free-tier backends that have
gone to sleep make this more likely, because the first requests after a cold start time out and get retried by people.

### Stream relay (bandwidth)

Sources that need addon request headers, are plain `http://`, or whose host refuses a browser's own request are
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

### Keeping a free Render service awake

A free Render web service goes to sleep after about 15 minutes without a request, and the first visit afterwards waits for it to
wake (up to a minute). If the MangoTV backend is also on a free plan it sleeps separately, and its database (Neon) suspends after
a few idle minutes too. One free uptime monitor can keep all of that warm:

1. Create a monitor (UptimeRobot's free plan works; any "HTTP(s)" monitor does) for
   `https://<your-web-service>/api/health?deep=1` with an interval of **5–10 minutes** (anything under 15).
2. `?deep=1` makes this server ask the MangoTV backend's `/health` as well (which touches its database), so this single address
   keeps the web service, the backend and the database awake. The backend is asked at most once a minute however often the
   address is called. The answer is always HTTP 200 when this server is up, with `{"status":"ok","backend":"up"}` — or
   `"backend":"down"` when the backend isn't answering; use a **keyword** monitor for `"backend":"up"` if you want to be told about that.
3. Without `?deep=1`, `/api/health` only answers for this server.

**Mind the free hours.** Render's free plan gives a limited number of free instance hours per month across your free services
(750 at the time of writing — check your dashboard). One service awake all month uses about 744 of them; **two free services both
kept awake all month use roughly double that**, and Render suspends free services for the rest of the month once the allowance is
spent. If both are free, keep only the one that matters most awake, or accept the sleep, or move one to a paid plan. Neon's free
compute allowance is also limited, and a pinged database never suspends.

### Monitoring

The service logs one line at start-up and nothing per request (no bodies, no tokens, no passwords). Add your platform's
request logging or uptime probe on `/api/health` as needed.

## 6. Security reminders

* Never commit `.env`; `.gitignore` already excludes `.env*` except `.env.example`.
* Never add `DATABASE_URL`, Neon credentials or the API's own signing/secret values to this service or to any
  `VITE_*`/public variable. They are not needed here and the client bundle contains no configuration at all.
* Payment verification (if payments are ever added to MangoTV) must run in the trusted backend; the web client must
  never decide that someone has paid.

## 6. Two domains: arctv.org (marketing) and web.arctv.org (the app)

Like Stremio (www vs web), the app lives at **web.arctv.org** and **arctv.org** shows a small static marketing page from
[`landing/`](../landing) (plain HTML/CSS/JS, no build, no server).

1. **Add the app's new address first.** On the existing Render *web service*, add the custom domain `web.arctv.org`, create
   the `web` CNAME record Render shows you, and wait for the certificate. Check `https://web.arctv.org/api/health`.
2. **Create the marketing site.** Render → New → *Static Site* from this repo: root directory `landing`, publish directory
   `.`, no build command. Under *Redirects/Rewrites* add a rewrite `/*` → `/index.html` (so old links such as
   `arctv.org/movies` reach `redirect.js`, which forwards them to web.arctv.org).
3. **Move the apex.** Remove `arctv.org` from the web service, add `arctv.org` and `www.arctv.org` to the static site
   (redirect www → apex) and update the DNS records Render lists (apex A/ALIAS, `www` CNAME).
4. **Heads-up.** Sessions are host-only cookies, so everyone is signed out once on the new address. Accounts and data are
   untouched (they live in the backend).
5. **Backend repo.** Check `MikeC444/ArcTV-AndroidTV` for any Stripe success/cancel or activation-page URL that names
   `arctv.org` and point it at `https://web.arctv.org`. This repo cannot change that.
6. `STREAM_RELAY`, `TRUST_PROXY` and the other settings above are unchanged; HSTS (`includeSubDomains`) is only sent by the app.
