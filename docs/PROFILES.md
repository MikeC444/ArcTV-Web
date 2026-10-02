# Profiles (ArcTV Plus)

One account can have up to **5 profiles**, in any mix of adult and kids. Each profile has its **own** My List, Continue Watching, watch history, settings (Home Rows, Subtitles, Blocked Genres…), addons and Like / Not for me. Nothing is shared between profiles. Profiles are **ArcTV Plus only**: without Plus an account has just its own profile (`main`) and no picker. Any profile can be locked with a **4-digit PIN**.

This file is the source of truth for the web app's behaviour **and** for what the backend (`MangoTV-Live-TV`) and the Firestick app have to do. The Firestick has **not** been changed yet (decision of 2 Oct 2026); the matching entries are in `docs/FIRESTICK_PARITY.md` (Pending on Firestick) and `docs/UPDATES.md`.

## What the user sees (web)

* **"Who's watching?"** (`/profiles`, `ui/screens/Profiles.tsx`): avatars, Add profile (while under 5), Manage profiles, Switch account (signs out). Shown at the start of every visit (once per browser tab) for a Plus account with more than one profile; the page the person was heading to opens afterwards. A locked profile asks for its PIN first.
* **Manage profiles**: rename, change the picture, Adult / Kids, PIN on / off / change, remove. A locked profile needs its current PIN to be changed or removed. The account's own profile can't be removed or made a kids profile.
* **Top bar**: the active profile's avatar and name at the top right (opens the picker). **Settings → Account** shows "Watching as …" with a link. **Settings → ArcTV Plus** lists Profiles as included (or "Coming soon" while the backend has no profiles).
* **Kids profile**: no Settings (so no addons, sign-out or Plus page; the Settings link and gear are gone and `/settings` goes Home), and these genres are hidden everywhere Blocked Genres applies, on top of the profile's own list: `Horror, Thriller, Crime, War, Mystery, Film-Noir, Adult` (`KIDS_BLOCKED_GENRES` in `domain/profiles.ts`). A title page for such a title can't be opened by its address either. Limit: filtering is by the genres an addon reports, so a title that comes with no genres can't be matched (same as Blocked Genres).
* Avatars are 12 preset colour tiles with a glyph (`AVATARS` in `domain/profiles.ts`); the **ids** are what is stored. The Firestick should map the same ids to its own artwork.

## How it works

* **The server decides which profile a request is for.** `POST /api/profiles/select` checks Plus (any profile but the account's own) and the PIN, then stores the profile id in the sealed session cookie (`pf`). `authedBackendRequest` adds `X-ArcTV-Profile: <id>` to every backend call from that cookie (never from anything the browser sends). It is left off for account-level paths: `/user/me`, `/user/plus`, `/user/profiles…`. No header means the account's own profile. The cookie survives token rotation.
* **The page reloads on a switch** (`window.location.assign`), so no store ever holds two profiles' data and no in-flight request can land in the wrong library. At launch `startSession` reads the profile list first (`state/profiles.ts` → `GET /api/profiles`), tells `state/profile.ts` which profile is active, then hydrates every store.
* **Local cache is per profile.** The account's own profile keeps the key names it always had (`mtv:v1:<user>:myList`, …), so nothing already cached is lost; other profiles use `mtv:v1:<user>:profile:<id>:<name>` (`libraryKey` / `libraryName`). Outboxes are named the same way. Likes / Not for me and "Picked for you" were already keyed per profile.
* **Plus lapses / profile deleted elsewhere**: `GET /api/profiles` answers with only the account's own profile when Plus is off and moves the cookie back to it.
* **Backend without profiles** (answers 404 on `/user/profiles`): `GET /api/profiles` answers `supported: false`; the app behaves exactly as before (one implicit profile, no picker, Plus tab says "Coming soon").

## Web server API (`server/src/routes/profiles.ts`)

| Request | Does |
|---|---|
| `GET /api/profiles` | `{ supported, plus, limit, profiles[], active }`. Only the account's own profile in `profiles` without Plus. |
| `POST /api/profiles` | Create `{ name (1–24), avatar, kind, pin? }`. Plus only; 400 over the limit of 5. |
| `PUT /api/profiles/:id` | Change `{ name?, avatar?, kind?, pin? (string, or null to remove) }`. Plus only. A locked profile needs `X-ArcTV-Pin: <current pin>`. |
| `DELETE /api/profiles/:id` | Remove. Plus only; needs `X-ArcTV-Pin` if locked; not the account's own profile. |
| `POST /api/profiles/select` | `{ profileId, pin? }`: opens it for this browser (cookie). 10 per minute per address. |

Error codes (in the usual `{ error: { code, message } }`): `plus_required` (403), `pin_required` (403), `wrong_pin` (403).

## What the backend (MangoTV-Live-TV) provides

**Built** on branch `claude/kind-franklin-1m27l9` of `MikeC444/MangoTV-Live-TV` (migration `0018_profiles`, 220 backend tests passing, `CHANGELOG.md` Post-Milestone-51), **not merged or deployed yet**. The web server only holds the *behaviour* around the list; the profiles themselves and each profile's library live in the backend. Until the backend is deployed, the web app runs in the "no profiles" mode above. What it implements, for the Firestick to rely on:

1. **`profiles` table**: `id` (text, stable; the account's own profile is always `main`), `account_id`, `name` (≤24), `avatar` (one of the 12 ids), `kind` (`adult` | `kids`), `pin_hash` (null = no PIN; **hash it** with a slow hash, 4 digits, never return it), `is_default`, timestamps. Created lazily: every account has `main` (named after the account's display name, avatar `sunrise`). Max 5 per account (the web server checks too).
2. **Endpoints** (all bearer-authenticated, all for the signed-in account only):
   * `GET /user/profiles` → `{ profiles: [{ id, name, avatar, kind, hasPin, isDefault }] }`
   * `POST /user/profiles` `{ name, avatar, kind, pin? }` → 201 with the profile
   * `PUT /user/profiles/:id` `{ name?, avatar?, kind?, pin? | null }` → the profile
   * `DELETE /user/profiles/:id` → 204 (deletes that profile's library with it; never `main`)
   * `POST /user/profiles/:id/verify-pin` `{ pin }` → **204 right, 403 wrong** (never 401: the web server reads 401 as "session over"), **429** after repeated wrong tries (lock the profile for a while per profile, not per address).
3. **Per-profile libraries.** Every other `/user/*` call takes the profile from the **`X-ArcTV-Profile`** request header (absent = `main`): `/user/watchlist`, `/user/watch-progress`, `/user/continue-watching`, `/user/history`, `/user/settings`, `/user/addons`, `/user/feedback`. Add `profile_id` (default `main`) to those tables and include it in their natural keys. **Existing rows belong to `main`.** The header must be checked to belong to the account (404 otherwise). `/user/feedback` already has `profileId`; keep it and treat the header as the authority. `/user/trailer`, `/user/release-date`, `/user/plus`, `/user/me` are account-level and ignore it.
4. **Plus**: the web server already enforces Plus for create / edit / remove / open-another-profile. The backend should also refuse to create or select profiles other than `main` for an account without Plus.
5. **Rate limit** `verify-pin` and lock out guessing (4 digits is only 10,000 tries): implemented as 5 wrong PINs in a row lock the profile for 5 minutes (429 + `Retry-After`), counted per profile whatever the address, plus 30 per minute per address.

Tested end to end: `server/tests/integration/profiles.test.ts` runs this web server against the real backend and Postgres (`MANGOTV_BACKEND_DIR=<checkout of MangoTV-Live-TV> bash scripts/run-backend-integration.sh`). The pinned `MANGOTV_BACKEND_REF` in `scripts/lib/test-backend.sh` predates profiles, so there that suite skips itself.

Security note: the PIN is a household gate. It stops someone using the app from opening, changing or removing a locked profile; it does not protect against the account owner's own password.

## What the Firestick does

**Built** in `MikeC444/MangoTV-Live-TV` (merged to `main`, Post-Milestone-52, first shipped in release 0.1.5; top-bar picture and name in Post-Milestone-53 and 55; a sync fix in Post-Milestone-54). It differs from the web in how it works: the Firestick talks to the backend directly, so it keeps its own active profile id and sends `X-ArcTV-Profile` through one OkHttp interceptor (nothing for `main` or the account-level calls); a profile switch wipes the local caches and re-pulls that profile's library instead of reloading a page; the PIN is checked with `verify-pin` in the app, so it is a household gate rather than something the backend enforces on every request. Original checklist, for reference:

Tracked in `docs/FIRESTICK_PARITY.md`. In short: a "Who's watching?" screen on launch (D-pad friendly tiles, PIN pad), Manage profiles, the same limits (5, Plus only, 4-digit PIN), the avatar ids mapped to artwork, `X-ArcTV-Profile` on every `/user/*` request, per-profile local caches and outboxes, kids profile behaviour (the same blocked genres, no Settings), a switch-profile entry in the top bar or Settings, and the same fallback when the backend answers 404 for `/user/profiles`.
