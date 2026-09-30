# Phase 1 audit — Firestick app → MangoTV Web

Source of truth: `MikeC444/MangoTV-Live-TV` (read-only, inspected at commit `924d366`).
Target: `MikeC444/MangotvWebb` (was empty — no commits, no config to preserve).

Nothing in the source repository was modified, and nothing in this repository
touches a database directly.

## 1. What the source repository actually is

| Area | Finding |
|---|---|
| Client | Kotlin / Jetpack Compose TV app (`app/`), Media3/ExoPlayer, Stremio-protocol addon client. 960 × 540 dp reference layout, D-pad first. |
| Backend | `server/` — Node 20+ / Express 5 / TypeScript / `pg` (no ORM) / Zod / Argon2id. **The app never talks to Postgres.** |
| Database | Neon Postgres, 14 forward-only migrations (`server/migrations/0001`–`0014`). Only the backend process holds `DATABASE_URL`. |
| Auth provider | **Custom, in the backend** — email + password (Argon2id) → opaque 256-bit access (1 h) and refresh (30 d) tokens, SHA-256-hashed in `sessions`. No third-party identity provider (no Neon Auth, Supabase, Firebase). |
| Content | No built-in catalogue. Users install Stremio-protocol addons (default: Cinemeta, `https://v3-cinemeta.strem.io/manifest.json`); the app calls addons directly from the device. |
| Playback | Media3/ExoPlayer, direct `url` streams only (HLS/DASH/progressive). `infoHash` (torrent) and `ytId` sources are shown but produce a "torrent streaming isn't supported" error. |
| Deployment config | Production API URL and database URL are **not in the repository** (`API_BASE_URL` is a GitHub secret / `local.properties`; `DATABASE_URL` is a server env var). |

### Features that the request mentions but the source does **not** contain

I searched every Kotlin, TypeScript, SQL, XML and Markdown file (`live tv`, `iptv`,
`m3u`, `country`, `payment`, `stripe`, `subscription`, `profile`):

* **Live TV / IPTV / country selection** — not implemented. The nav bar is
  `Home · Movies · TV Shows · Genres · Search · My List · Settings`. The
  CHANGELOG even records "live TV" being *removed* from the sign-in copy.
* **Payments / payment verification** — not implemented; there is no billing table or endpoint.
* **Multiple user profiles** — not implemented (one account = one library).

These are therefore **not ported** (nothing to preserve, and inventing them
would mean fabricating product behaviour, IPTV sourcing and payment flows).
They are listed under "Open product questions" in the README.

## 2. Where user data actually lives

Traced from `data/sync/*`, `data/network/*`, `server/migrations/*` and `server/src/services/*`.

### 2.1 Cloud (Neon, keyed by `users.id`, isolated by `requireAuth`)

| Table | Content | Endpoints the web app uses |
|---|---|---|
| `users` | account, Argon2id hash | `POST /auth/register`, `POST /auth/login`, `GET /user/me` |
| `devices` / `sessions` | one row per (account, device); token hashes | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/qr/*` |
| `user_settings` | Home-row order + hidden rows, autoplay-next, skip-intro, subtitles on/off, default subtitle language | `GET/PUT /user/settings` |
| `user_addons` | installed addons (manifest URL, cached manifest JSON, enabled, sort order) | `GET/POST/DELETE /user/addons` |
| `watchlist_items` | My List incl. `watched` flag | `GET/POST/DELETE /user/watchlist` |
| `continue_watching` | resumable pointer per title | `GET /user/continue-watching`, `POST /user/watch-progress` |
| `watch_history` | per-episode progress log | `POST /user/watch-progress` (write), `GET /user/history` (used for the "watched" backfill) |
| — | TMDB trailer / release-date lookup (server holds the TMDB key) | `GET /user/trailer`, `GET /user/release-date` |

Conflict rule (all domains): **last-write-wins on the client-supplied
`updatedAt`**, applied in one atomic `INSERT … ON CONFLICT … WHERE EXCLUDED.updated_at > …`.
Removal is a soft delete (`deleted_at`).

### 2.2 Device-local on the Android TV (DataStore) — *cannot* be read from a browser

| Local store | Synced to cloud? | Web equivalent |
|---|---|---|
| `mango_my_list`, `mango_continue_watching`, `mango_addons`, `mango_home_row_prefs`, `mango_player_preferences` | **Yes** — these are caches of the cloud domains above | Browser cache of the same domains (per-user, cleared on sign-out) |
| `mango_sound_preferences` (navigation volume) | **No** | Browser-local setting |
| `mango_last_source` (last stream chosen per title/episode) | **No** | Browser-local setting (per user) |
| `mango_home_cache`, first-sync flag, watched-backfill flag, update prefs, device UUID, encrypted session | No (cache / bookkeeping) | Not needed / regenerated |
| `PendingChangeStore` outboxes | No — but they drain to the cloud when the TV next runs | See §4 |

**Conclusion:** everything users care about (account, My List, Continue Watching,
watch history, addons, Home-row layout, autoplay/skip-intro/subtitle defaults) is
*already* in Neon. The only Android-local state that is not synced is the boot/navigation
volume and the "remember last source" shortcut — cosmetic conveniences that cannot be
migrated from a device the browser has no access to. Nothing needs to be
"uploaded" from a TV for the web version to work.

## 3. Architecture decision

```
Browser (React SPA)  ──same-origin──▶  MangoTV Web server (this repo, Node)  ──HTTPS + Bearer──▶  existing MangoTV API  ──▶ Neon
   no tokens in JS                      • sealed httpOnly session cookie
                                        • allow-listed reverse proxy
                                        • SSRF-hardened addon fetch fallback
```

Why a thin server in front of the existing API instead of calling it directly:

1. **The existing API sends no CORS headers** (its own activation page is same-origin
   to avoid needing them). Enabling CORS means changing the source repo, which is out
   of scope. A same-origin proxy needs no backend change.
2. **Tokens stay out of JavaScript.** The BFF keeps `{access, refresh}` in an
   AES-256-GCM-sealed `httpOnly; SameSite=Lax; Secure` cookie, refreshes transparently,
   and never exposes a token to page scripts (an XSS bug cannot exfiltrate a 30-day refresh token).
3. **The BFF has no database access and no database credentials.** All privileged
   operations stay in the existing backend, whose ownership checks (`req.user` from the
   verified session, never from a client-supplied id) are the isolation boundary.
   The BFF additionally strips any client `Authorization` header and only forwards an
   allow-list of paths.

The web app registers as just another **device** (`platform: "web"`, per-browser UUID),
so existing users sign in with their existing email/password, keep their user id, and
see the browser under `GET /auth/sessions` like any other device. No password reset,
no duplicate account, no second user table.

## 4. Data-migration plan

| Step | Decision |
|---|---|
| Database schema changes | **None.** The existing 14 migrations already cover every domain the web client needs. No `DROP`, `TRUNCATE`, or data rewrite is performed or required. |
| Existing accounts | Sign in via `/auth/login` unchanged (same email, same Argon2id hash, same `users.id`). |
| Existing cloud data | Pulled on sign-in through the same four GET endpoints the TV uses. |
| Local-only Android data | Not migratable (no access from a browser); documented above. |
| Browser first-login "sync vs start fresh" prompt | The web app has no guest mode, so a browser never has pre-existing account-less data. Data written while offline is queued per user in an outbox; on sign-out the outbox is flushed (5 s budget, like the TV) and then wiped, so a different user signing in on the same browser can never receive the previous user's queued writes. |
| Default addon | Not auto-installed into *existing* accounts. Only if the cloud addon list is empty (confirmed by a successful fetch) *and* this browser has not bootstrapped that account before, Cinemeta is offered/installed — the same default a fresh TV gets. |
| Verification against production | **Blocked** (see §6). Verified instead against an identical local instance: the unmodified source backend + all 14 migrations on a local Postgres 16. |

## 5. Screen / feature mapping

| Firestick (Compose) | Web route | Notes |
|---|---|---|
| `BootVideoScreen` (`newboot1.mp4`) | `<BootSplash>` on cold load | Muted autoplay (browser policy), skippable, same 10 s/20 s timeouts |
| `AuthGate` / `AuthStart` (hero photo, "Your Entertainment, Your Way") | `/auth` | Same layout, scrim, buttons |
| `AuthMethod` (QR vs remote) | `/auth/method/:intent` | "Scan a QR code" / "Type on my keyboard" |
| `PasswordSignIn` (login + register) | `/auth/password/:intent` | Same validation rules as `validateCredentials` |
| `QrSignIn` (create → poll every 2.5 s → auto-refresh on expiry) | `/auth/qr/:intent` | Uses the *existing* `/auth/qr/create` + `/auth/qr/status`; a phone completes it on the backend's `/activate` page |
| `HomeScreen` + `HeroSection` + `ContentRow` | `/` | Rotating hero (9 s, Ken-Burns), Continue Watching row, addon rows, Home-row prefs |
| `RowsBrowseScreen` (Movies / TV Shows / Genre results / My List) | `/movies` `/tv` `/genres/:genre` `/my-list` | 7-column grid on the TV; the web shows 9 across on desktop windows (`--poster-cols`, fewer on narrow ones) so posters are smaller; sort pills, infinite scroll, All/Watched filter |
| `GenresScreen` | `/genres` | 5-column coloured cards + icons |
| `SearchScreen` | `/search` | Movies + TV rows, addon-side search with client fallback |
| `DetailScreen` (+ Seasons, Cast, Similar) | `/detail/:provider/:type/:id` | Resume/Play, Trailer, Watched, Watchlist |
| `SourcesScreen` (+ filter/sort, recommended badge, auto-select last source) | `/sources/…` | Progressive loading as each addon answers |
| `PlayerScreen` + overlays (quality, audio, subtitles, speed, settings, advanced, source info) | `/player/…` | hls.js / dash.js / native `<video>`; progress reported every 30 s |
| `CardActionsMenu` (long-press) | context menu (right-click / long-press / `M` key) | Play/Resume, My List, Watched, Details, Remove from Continue Watching, Choose Source |
| `SettingsScreen` → Account / Addons / Home Rows / Sounds / Subtitles | `/settings/:tab` | Same two-pane layout |
| `AddAddonScreen` (LAN QR pairing + manual URL) | `/settings/addons/add` | LAN pairing server is Android-only → manual URL (accepts `stremio://`) |
| `UpdateBanner` (APK self-update) | — | Not applicable to a website |
| `TrailerLauncher` (external app) | new tab → YouTube | Same behaviour |
| `UiSoundPlayer` (`ui_*.wav`) | Web Audio, same WAVs | Volume from Settings → Sounds |

Web-specific implementations (cannot be shared conceptually with Android): session
handling (cookie BFF instead of Keystore-encrypted tokens), addon CORS/mixed-content
fallback, HTML5 media pipeline, spatial arrow-key navigation, responsive breakpoints,
browser cache/outbox instead of DataStore.

## 6. Blockers and risks found during the audit

1. **Production API URL / database are not in the repo.** I could not sign in to
   production or read real user rows. The web server needs `MANGOTV_API_URL`.
   `npm run verify:backend` is provided to run a read-only check against the real
   deployment with a test account. **Nothing here claims production data was verified.**
2. **Shared rate limits.** The backend rate-limits per IP (`/auth/*`: 10/min,
   everything: 120/min) with `trust proxy = 1`. All web users reach the API from the
   web server's egress IP, so they share those buckets. The web server adds its own
   per-client limiter and surfaces `429` politely, but at real scale the *smallest safe
   backend change* is to key the limiter on the bearer token / user id for `/user/*`
   (and to trust the web server's forwarded client IP for `/auth/*`). That change is
   **not** made here (source repo is read-only for this task).
3. **Last-write-wins uses the writer's clock** (`updatedAt` is client-supplied and must be
   strictly newer). A browser with a badly skewed clock can lose writes to a TV. The web
   client makes `updatedAt` strictly monotonic per key but cannot fix skew.
4. **Browser playback limits**: torrent (`infoHash`) sources, `ytId` sources, non-CORS
   HLS/DASH hosts, mixed-content `http://` media, and codecs the browser lacks (HEVC,
   AC-3/E-AC-3 in some browsers, embedded MKV subtitles) cannot play. The player reports
   each case explicitly instead of failing silently.
