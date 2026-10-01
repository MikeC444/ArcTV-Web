# MangoTV for the web

A browser version of the **MangoTV Fire TV / Android TV app**. Same look, same screens, same accounts.

Sign in with the email and password you already use on your Firestick and you see the same My List, Continue
Watching, installed addons, Home-row layout and playback preferences — because the web app talks to the **same
MangoTV backend (and therefore the same Neon database)** as the TV app. Nothing is copied, migrated or duplicated.

* Source of truth for design and behaviour: [`MikeC444/MangoTV-Live-TV`](https://github.com/MikeC444/MangoTV-Live-TV) (read-only — nothing in this repository writes to it).
* What was inspected, and every decision that followed from it: [`docs/AUDIT.md`](docs/AUDIT.md).
* How to put it online: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> **Status.** Built, linted, type-checked and tested (unit, integration against the real backend, and 60 browser tests
> at four screen sizes). **It has not been run against your production backend** — that URL and database are not in
> the repository. Run `npm run verify:backend` against production with a test account before going live
> (see [Verify against production](#verify-against-your-production-backend)).

## Contents

1. [How accounts and data are shared](#how-accounts-and-data-are-shared)
2. [Architecture](#architecture)
3. [What is included](#what-is-included)
4. [Getting started](#getting-started)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Verify against your production backend](#verify-against-your-production-backend)
8. [Supported browsers and playback](#supported-browsers-and-playback)
9. [Security model](#security-model)
10. [Known limitations](#known-limitations)
11. [Open product questions](#open-product-questions)
12. [Repository layout](#repository-layout)

## How accounts and data are shared

The TV app never talks to the database. It talks to a Node/Express API (`server/` in the Firestick repository)
which is the **only** component that holds `DATABASE_URL`. Authentication is that API's own email + password login
(Argon2id) issuing opaque access/refresh tokens; there is no third-party identity provider.

The web app is simply *another device* of the same account:

| | Fire TV app | Web app |
|---|---|---|
| Sign in | `POST /auth/login` with email + password (or QR pairing) | the same endpoint (or the same QR pairing flow), called by the web server on the browser's behalf |
| Identity | `users.id` | the same `users.id` — no second account, no password reset |
| Device row | `platform: "fire_tv"` | `platform: "web"`, one per browser (shown like any other device) |
| My List, Continue Watching, history, addons, Home rows, subtitle/autoplay settings | `/user/*` endpoints | the same endpoints |
| Conflict rule | last write wins on `updatedAt` | the same rule (timestamps are made strictly monotonic per item) |
| Stays on the device only | navigation-sound volume, "remember last source" | the same two things stay in the browser |

What you change in the browser shows up on the TV (and vice versa) after the next sync. **No migration was
necessary and none was run**: no schema change, no `DROP`, no `TRUNCATE`, no data rewrite.

Isolation between accounts is enforced where it always was — in the existing backend, which derives the user from
the verified session and never from a client-supplied id. The web server adds a second layer: it forwards only the
session's own bearer token (any client-sent `Authorization` header is discarded) and only an allow-list of 14
method + path pairs. `server/tests/integration/isolation.test.ts` proves, against the real backend, that two accounts
cannot read or change each other's data, including natural-key and far-future-timestamp attacks.

## Architecture

```
Browser (React SPA)  ──same origin──▶  MangoTV Web server (this repo, Node)  ──HTTPS + Bearer──▶  existing MangoTV API ──▶ Neon
   no tokens in JS                      • sealed httpOnly session cookie
                                        • allow-listed reverse proxy (/api/user/*)
                                        • SSRF-hardened addon fetch fallback (/api/addon-proxy)
                                        • serves the built SPA (production)
```

* **Why a server at all?** The existing API sends no CORS headers (its own activation page is same-origin), and
  changing it is out of scope. A same-origin server needs no backend change, and it keeps access/refresh tokens out of
  JavaScript: they live in an AES-256-GCM-sealed `httpOnly; SameSite=Lax; Secure` cookie that the server refreshes
  transparently (single-flight, so parallel tabs never race a rotating refresh token).
* **The web server holds no database credential.** It cannot reach Postgres and never will; its only secrets are
  `SESSION_SECRET` (cookie sealing) and the API URL.
* **Client** — React 18, TypeScript, Vite, zustand. State per domain (`myList`, `continueWatching`, `addons`,
  `settings`, `lastSource`) is cached in `localStorage` under `mtv:v1:<userId>:…`, written through an outbox that
  retries when the browser comes back online, and wiped on an explicit sign-out. Addons are called directly from the
  browser when they allow it (CORS, https) and through the server's SSRF-hardened proxy when they don't.
* **Layout parity, at desktop size** — the Compose tokens (colours, radii, type scale, spacing, focus animation) are carried
  over one for one, but the TV's sizes are meant to be read from a sofa, so `1dp` is **1px up to a 1745-px-wide window and
  1.1px at 1920** (then it grows with the window, at most 2px). Text, buttons and spacing are roughly half the TV's size;
  posters are sized by how many fit across (8 at 1920, 7 on a laptop) rather than in dp. To make everything larger or
  smaller, change `--dp` in `client/src/styles/tokens.css`.

## What is included

Everything in the Fire TV app that can run in a browser:

* **No account needed to browse.** Visitors without an account go straight to Home and can browse Movies, TV Shows, Genres, Search and
  titles' details (using the default Cinemeta addon). The sign-up / log-in screens appear only when they press **Play**, open **My List**
  or **Settings**, or save a title; after signing in they return to where they were heading. (Trailers and release dates need an account.)
* Welcome (no boot video on the web), **Log in / Sign up** (email + password with the app's validation rules) and **QR
  sign-in** (uses the existing pairing endpoints; a phone finishes it on the backend's own activation page).
* **Back buttons** (Detail, a genre's page, Select a Source) return to the exact place you came from — same page, same scroll position, same row swipe, and the same Movies / TV / genre grid — because history and positions are remembered per page.
* **Home** (a hero that flicks through 10 random titles from your enabled rows every 5 seconds — topped up at random from the other rows only if those hold fewer than 10 — Continue Watching, one row per addon catalogue, your Home-row order and hidden rows; a title shows in only one row — the first that holds it, and Continue Watching leaves out titles that a row already shows),
  **Movies**, **TV Shows** (grids of 8 posters across at 1920 and 7 on a laptop — 6 / 5 / 4 / 3 on narrower windows — with sort pills and infinite scroll), **Genres**, **Search**, **My List** (All / Watched).
* **Detail** pages (Resume / Play, trailer, watched, watchlist, seasons and episodes, cast, similar titles) and the
  card quick-actions menu (right-click, long-press or `M`).
* **Select a Source** with quality badges, health, sizes, "Recommended" (always the first row, whatever the filters and sort), filters and sort, remembering your last source.
* **Player**: quality / audio / subtitle / speed menus that list the stream's real tracks, seek bar with a hover-time tooltip,
  skip ±10 s, volume, fullscreen, Media Session controls, wake lock, resume, progress saved to your account every 30 s and
  on pause / exit, "watched" at 85 %, **autoplay next episode** with the 5-second countdown.
* **Settings**: Account (sign out), Addons (install by URL / `stremio://`, enable, remove), Home Rows (hide / reorder),
  Sounds, Subtitles — all synced.
* Loading skeletons, empty states, offline banner, error boundaries, "session expired" handling.
* Mouse, keyboard, touch **and** TV-remote-style arrow-key navigation (spatial focus, `Enter`, `Esc`/`Backspace`); the
  arrow keys are an additional mode, not a requirement. Skip link, focus rings, ARIA roles/labels, reduced-motion support.

Not in the Fire TV app, and therefore **not invented here**: Live TV / IPTV / country selection, payments, and multiple
profiles (see [Open product questions](#open-product-questions)). Android-only features that make no sense on a website
(APK self-update, LAN-QR addon pairing) are replaced by their web equivalent or omitted; see the mapping table in
[`docs/AUDIT.md`](docs/AUDIT.md#5-screen--feature-mapping).

## Getting started

Requires **Node 22.9 or newer** (`nvm use` reads `.nvmrc`).

```bash
npm ci
cp .env.example .env          # then set MANGOTV_API_URL (and SESSION_SECRET for production)

npm run dev                   # web server on :8080 (reads .env)
npm run dev:client            # in a second terminal: Vite on http://localhost:5173, proxying /api to :8080
```

Open <http://localhost:5173> and sign in with an account from your MangoTV backend.

Production build and run:

```bash
npm run build                 # client → client/dist, server → server/dist
NODE_ENV=production PORT=8080 MANGOTV_API_URL=https://… SESSION_SECRET=$(openssl rand -base64 48) npm start
```

The server then serves the SPA and the API from one origin. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Other scripts: `npm run lint`, `npm run typecheck` (client, server and e2e), `npm test`.

## Built-in catalog (optional)

With `TMDB_API_KEY` set, the web server also serves **Mango TV Catalog**, a real Stremio addon of its own at `/addon/manifest.json`
(catalog + meta, built on TMDB): Popular, Trending, Top Rated and genre rows with TMDB artwork, logos, cast and episode lists. Titles
use IMDb ids (`tt…`), exactly like Cinemeta, so stream addons and the TV app keep working; a title TMDB has no IMDb id for is left out.

* **Everyone gets it, nobody's account changes.** The web app adds it to the providers in the browser, after the person's own addons.
  It is never installed into an account, never synced, and not shown as an installed addon (Settings → Addons just mentions it).
  Visitors without an account browse with it instead of Cinemeta. Hide any of its rows under Settings → Home Rows, or turn the whole catalog off with its switch under Settings → Addons (that choice is kept in this browser only, never in the account).
* **Without a key, or if TMDB is unreachable,** nothing is added and the app behaves as before.
* Ratings on its titles are TMDB's score, and Detail labels them "TMDB Rating".
* Answers are cached (30 min for lists, days for ids) and requests to TMDB are capped and retried; `/addon` is public, rate-limited
  per client and read-only. Brand-new accounts still get Cinemeta written to them like a fresh TV, as before.

## Configuration

Set on the **server only**. Nothing here is exposed to the browser and nothing here is a database credential.

| Variable | Required | Meaning |
|---|---|---|
| `MANGOTV_API_URL` | yes | Base URL of the existing MangoTV API (the value the Fire TV build uses as `API_BASE_URL`), no trailing slash. Must be `https://` in production. |
| `SESSION_SECRET` | production | ≥ 16 chars, seals the session cookie: `openssl rand -base64 48`. Rotating it signs everyone out (no data is lost). |
| `NODE_ENV` | no | `production` enables `Secure` cookies and HSTS. |
| `PORT` | no | Default `8080`. |
| `TRUST_PROXY` | no | `1` when exactly one reverse proxy is in front (most PaaS), so client IPs and HTTPS are read correctly. |
| `CSP_EXTRA_CONNECT_SRC` | no | Extra origins for the Content-Security-Policy `connect-src`, comma separated. |
| `TMDB_API_KEY` | no | A free [TMDB](https://www.themoviedb.org/settings/api) key (v3 key or v4 read-access token). Turns on the **built-in catalog** (see below). Without it the built-in catalog is simply off and nothing else changes. Also `TMDB_API_BASE` / `TMDB_IMAGE_BASE` (defaults: TMDB's own) for testing. |
| `STREAM_RELAY` | no | Default `1`. The [stream relay](docs/PLAYBACK.md) that plays sources a browser can't fetch itself. `0` turns it off. Relayed video uses this server's bandwidth. |

`.env.example` contains placeholders only; `.env*` files are git-ignored. The client bundle contains no configuration
and no secrets.

## Testing

| Command | What it proves |
|---|---|
| `npm run lint && npm run typecheck` | ESLint (zero warnings) and strict TypeScript for client, server and e2e code |
| `npm test` | **118 client** unit tests (Stremio mapping, stream ranking/playability/device support, relay addresses, stores, outbox, sync rules) and **97 server** tests (cookie sealing, CSRF, session refresh/rotation, allow-list, SSRF guard, stream relay, static hosting) |
| `npm run test:integration` | The **real, unmodified backend** from the Firestick repo, all 14 migrations, on a throwaway local Postgres: an account created the way the TV creates it signs in on the web with the same user id and sees its synced data; TV ↔ web sync with last-write-wins; **two accounts cannot read or modify each other's data**; token refresh / expiry / revocation; QR flows; logout revocation |
| `npm run test:e2e` | Playwright + Chromium against that backend, the built SPA (served twice: without a TMDB key, and with one pointing at a fake TMDB for the built-in catalog) and a local Stremio-protocol fixture addon: sign-in (existing account, wrong password, QR, sign-up, sign-out, remote revocation), browse, search, My List, Detail, Sources, real playback (WebM and HLS) with progress reported to the account, playback of sources a browser can't fetch itself via the stream relay, resume, autoplay-next, settings sync, keyboard navigation, layout proportions of the Compose tokens at 1920 × 1080, and no-overflow layouts at 1920, 1366, 820 and 390 px |

`npm run test:integration` and `npm run test:e2e` run the backend from `MikeC444/MangoTV-Live-TV` (cloned at a pinned
commit, or point `MANGOTV_BACKEND_DIR` at a local checkout) against a Postgres database you provide via
`TEST_DATABASE_URL`. That database **must be disposable**: the scripts refuse any name that does not contain `test` or
end in `_it`, apply the backend's own migrations to it, and never touch production or the source repository. (When run
as root on a Debian/Ubuntu box with PostgreSQL installed, as in CI and the build sandbox, the scripts create one
automatically.) Screenshots of every screen at all four sizes are written to `e2e/screenshots/<project>/` on each run.

**About "compare with Firestick screens".** No Firestick screenshots were available to this project, so a
pixel comparison was not possible. Layout parity is instead asserted numerically (`e2e/tests/parity.spec.ts`
reads computed sizes, radii, gaps and colours in the browser and compares them with the values in the Compose
source), and the screenshots are there for a human side-by-side.

**Fixture addon.** The sandbox this was built in cannot reach Cinemeta, so browse/search/playback are tested with a
local, protocol-compliant fixture addon (`e2e/fixtures/fake-addon.mjs`, synthetic titles and generated art). The
Cinemeta default is exercised at the unit level (manifest normalisation and mapping) but not live.

## Verify against your production backend

```bash
MANGOTV_API_URL=https://your-backend.example VERIFY_EMAIL=you@example.com VERIFY_PASSWORD='…' npm run verify:backend
```

Uses only public API calls: health → login → `/user/me`, settings, watchlist, continue-watching, history, addons
(prints counts only) → logout → checks the old token is revoked. It never prints tokens, refuses plain `http://` to
non-local hosts and writes no user data. Its only side effects: one session that it revokes, and one device entry named
"MangoTV web verification" per account.

## Supported browsers and playback

Current Chrome, Edge, Firefox and Safari (desktop and mobile). The player uses the native `<video>` element for
progressive files, **hls.js** for HLS (Safari uses its native HLS) and **dash.js** for DASH; both libraries load only
when someone presses Play.

A browser is stricter than a TV, so some sources cannot play, and the app says so plainly instead of failing quietly
or silently picking another source:

| Source | Behaviour |
|---|---|
| Direct HTTPS MP4 / WebM / HLS / DASH | Plays if the codecs are supported by the browser. Requested directly first; if the browser's request fails outright (the host refuses it), the player retries **once through the stream relay** (below). A host that answers but sends data slowly is *not* sent to the relay — the player waits, then says the host is too slow |
| Torrent (`infoHash`) / magnet | Listed, badged "Can't play here — Torrent source", explains why on click. Use an addon that returns direct (debrid) links |
| YouTube-only (`ytId`) | Explained; the trailer button opens YouTube in a new tab like the TV does |
| Sources needing custom request headers (`proxyHeaders`) | Play **through the stream relay** from the start ("via this site's relay"), which adds the addon's headers server-side. The relay cannot help a host that refuses server-side requests outright (for example Torrentio's Cloudflare front does) — the error then says who refused it |
| `http://` media on the https site | Play through the stream relay (a browser would block them) |
| MKV / AVI / HEVC / AC-3 etc. | Checked against **this browser's own codec support** (see below). **MKV is not a format browsers officially support**: an MKV is only "Should play here" when its release name confirms a decodable video codec *and* a usable audio track; otherwise it reads "Might not play", and MKVs rank below MP4 / WebM / HLS. If one fails anyway, the error names the likely cause and offers **Change Source** |
| DRM (Widevine / FairPlay / PlayReady) | Not implemented — the Firestick app has no DRM path either |

### Which sources can this device play?

Select a Source asks the browser itself what it can decode (`canPlayType` / MediaSource — not a guess from its name) and
reads each source's file name and link for its container, video codec and audio codec. Every row then carries a badge:

| Badge | Meaning |
|---|---|
| **Should play here** | Container and codecs are ones this browser supports |
| **No sound here — Dolby Digital Plus audio not supported** | Picture should play; the only audio track is one the browser can't decode |
| **Can't play here — HEVC (x265) video not supported** / **MKV not supported** / **Torrent source** … | Won't work in this browser; the reason is on the row |
| **Format unknown — May play** / **Might not play** | The source doesn't say what it is, or its addon says it isn't web-ready |

Debrid-style names are read too: `[RD+]` means the file is already **cached** at the debrid service (starts at once),
`[RD download]` means the service still has to fetch it, which can take minutes — such sources show "Not cached on
Real-Debrid — may take minutes", rank below ready ones, and if one sits on a spinner the player says why.

The list starts sorted by **Size** (biggest first). "Sort by: Quality" lists playable sources first, **Recommended** is always the best playable one, the **Plays on this
device** pill hides everything else, and **This device** (under the list) shows what your browser supports. The badges are
a strong hint rather than a promise — they are derived from text — and a source whose server never answers can still
fail; that case is reported by the player's start-up watchdog. Logic and tests: `client/src/domain/deviceSupport.ts`.

### The stream relay (Stremio's `/proxy/`, built into this server)

Stremio Web gets around hosts a browser can't use by sending the stream through its streaming server. A website has no
local server, so MangoTV's own web server does that job: `/api/relay/d=<origin>&h=<header>&r=<header>/<path>` fetches the
stream like a native player would (no browser headers, plus the addon's `proxyHeaders`), and streams it back with `Range`
support. It is for signed-in users' own streams only — same-origin, media content types only, private/loopback/metadata
addresses refused at connect time, every redirect re-validated, no cookies or `Referer` forwarded, a per-user
concurrency cap — and `STREAM_RELAY=0` disables it. If the relay can't get the stream either, the error says so and
**Technical details → Test connection** shows what the stream host answered. Trade-offs (server bandwidth, the debrid
service seeing the server's IP) and the investigation are in [`docs/PLAYBACK.md`](docs/PLAYBACK.md); the copied address
builder's MIT attribution is in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### "Nothing plays" / "No sources found"

Playback starts from **Select a Source**, which asks **every enabled addon on your account** for streams of the title
(stream-only addons such as debrid addons included; an addon whose manifest lists resources without `stream`, like
Cinemeta, is skipped). Under the list, **Addon results** shows what each addon answered — number of sources, "no streams
for this title", "doesn't provide streams", or why it failed (timed out, HTTP 500 …) — and **Try Again** re-asks. If every
addon says "no streams", the title simply has no sources yet (new or obscure titles often don't). If sources are listed
but won't play, the reason is in the table above (torrent-only, MKV/HEVC/Dolby audio, headers, CORS, insecure HTTP).
`e2e/tests/addons.spec.ts` proves this flow with stream-only addons whose URL carries a config, with and without CORS.

## Security model

* No database URL, Neon credential, service key or signing secret exists in client code, in the repository, or in any
  public environment variable. The browser never sees an access or refresh token.
* Session cookie: sealed (AES-256-GCM, HKDF-derived key, purpose-bound), `httpOnly`, `SameSite=Lax`, `Secure` in production.
* CSRF: all mutations must carry a custom header and pass `Sec-Fetch-Site` / `Origin` checks.
* `/api/user/*` is an allow-list, not a pass-through; the bearer is always the session's own.
* The addon fallback proxy is SSRF-hardened: connect-time DNS validation, private / loopback / link-local / metadata
  ranges blocked, https-only outside tests, JSON only, ≤ 2 MB, redirects re-validated, timeouts.
* The stream relay is session-only, same-origin, GET/HEAD, media-only, SSRF-guarded like the addon proxy, and never
  forwards cookies, `Referer` or the addon's headers to a redirect target.
* Content-Security-Policy without inline scripts, `frame-ancestors 'none'`, HSTS, per-IP rate limits, and `Referrer-Policy: same-origin`
  (video hosts, addons and image CDNs never learn where the app is hosted).
* Payment state is never trusted from the client — there are no payments in this product today; if added, verification
  must stay in the backend.
* Passwords are only ever sent to the backend over TLS and are not logged or stored by the web server.

## Known limitations

1. **Production is unverified** (no access to the production URL or data). Use `npm run verify:backend`.
2. **Shared backend rate limits.** The existing backend rate-limits per IP (`/auth/*` 10/min, everything 120/min) and trusts
   one proxy hop. All web users arrive from the web server's address, so at real scale they share those buckets. The web
   server forwards the real client IP and adds its own limiter, but the proper fix is a small change in the backend (key
   `/user/*` on the user id, trust the web server's forwarded IP for `/auth/*`). It was **not** made because the
   Firestick repository is out of scope for this work — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#rate-limits). Until
   then the sign-in form shows a countdown when the backend says "too many requests", and a refused token refresh is not
   re-sent on every request.
3. **Prefer a single web-server instance** (or sticky sessions): refresh-token rotation is de-duplicated in memory.
   Sessions are self-contained in the cookie, so several instances do work, but if two of them rotate the same refresh
   token at the same moment the backend may reject the second, and that user has to sign in again.
4. **Clock skew.** Last-write-wins uses the writer's clock. The web client keeps its own timestamps monotonic but cannot
   correct a device whose clock is badly wrong.
5. **Device-only Android data** (navigation volume, last-source memory) cannot be read from a browser and is not migrated
   (it is cosmetic; everything that matters is already in the cloud).
6. Browser playback limits as described above; no offline downloads; no Chromecast/AirPlay (not in the TV app either).

## Open product questions

These appear in the request but **do not exist in the Firestick app or its backend** (searched for `live tv`, `iptv`,
`m3u`, `country`, `payment`, `stripe`, `subscription`, `profile`), so nothing was built or faked:

* **Live TV / IPTV with country selection** — needs a decision on the (legal) channel source. The web architecture
  can host it (the player already handles HLS), but no source, licensing or UI spec exists.
* **Payments / subscriptions** — no billing tables or endpoints. If they are added, the web server must call a
  server-side verification endpoint; a client-side "paid" flag must never grant access.
* **Multiple profiles** — one account is one library today.
* Copy ported verbatim from the TV (for example the sign-in "Safe & secure" line) is the owner's wording; review it
  for the web context.

## Repository layout

```
client/    React SPA (src/styles = Compose tokens → CSS, src/ui = screens/components, src/state = stores + sync, src/domain = Stremio protocol)
server/    Node web server (session cookie, allow-listed proxy, addon proxy, static hosting) and its tests
e2e/       Playwright specs, fixture Stremio addon + synthetic media, screenshots
scripts/   test-backend harness, e2e runners, verify-backend
docs/      AUDIT.md (Phase 1 findings), DEPLOYMENT.md
```
