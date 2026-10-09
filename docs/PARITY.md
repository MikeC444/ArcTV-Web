# Web changes to carry over to the Firestick and phone apps

Every user-visible change made on the web app is recorded here, newest first, so the same change can be made on the **Firestick**
(`MikeC444/ArcTV-AndroidTV`) and the **phone app** (`MikeC444/ArcTV-MobileAPK`). Nothing is deleted when it is done: a change stays
in the table with its status until both apps have it, then moves to **Done on both** (kept as the record).

Status: ⬜ not done · ✅ done (released or merged) · ➖ not needed there (say why in the notes).

## Web changes to carry over

| Date | Change | Firestick | Phone |
|---|---|---|---|
| 2026-10-09 | **Home rows: Popular, New, Top rated, nine genres, a different page each day, seen titles hidden** (details below) | ⬜ | ⬜ |
| 2026-10-09 | **Home Rows order:** New and Top rated sit above rows someone already chose, until they place them in Settings > Home Rows | ⬜ | ⬜ |
| 2026-10-07 | Plus list: the bigger stream relay allowance is removed; the promo names only what is live | ✅ (never had it) | ⬜ check |

### Notes on the open items

- **Fresher, tidier Home rows** (web, 2026-10-09; the phone app does not have it either). For Cinemeta (and any addon shaped like it: catalogues `top`, `year` and `imdbRating`), Home shows **Popular, New, Top rated**, then only nine wide-appeal genres (Action, Comedy, Drama, Thriller, Horror, Sci-Fi, Crime, Animation, Documentary), not every genre. Each ranking is read from a different page (100 titles each; mostly page 1, sometimes 2 or 3; New only 1 or 2) chosen by account + day, and gently reshuffled within it favouring the better ranks, so rows are steady all day and differ tomorrow (`domain/homeVariety.ts`, `provider.ts`). Titles already watched, saved to My List or rated (Like / Not for me) are left out of the catalogue rows (they stay in My List, Continue Watching and still count for Picked for you). One title still shows in only one row. Other genres stay on the Movies / TV Shows pages. On the Firestick, `StremioAddonProvider.buildSectionsFlow` still makes one merged row plus every genre, and `HomeViewModel` does not hide seen titles.

- **Home Rows order** (`domain/homeRows.ts`, `applyRowOrder`): a "lead" row (New, Top rated) the person has not placed goes right after any lead rows they did place, ahead of the rows they chose. Once they move it in Settings it is part of their saved order.

## Done on both

| Date | Change | Firestick | Phone |
|---|---|---|---|
| 2026-10-07 | Smart source picking (Plus), switch in the Plus settings tab, plain loading screen while it decides | ✅ 0.3.0 | ✅ merged, not released |
| 2026-10-07 | Your stats (Plus): headline total, week chip, 13-week grid, movies-or-shows split, busiest day; glowing bars | ✅ 0.3.0 | ✅ merged, not released |
| 2026-10-07 | Plus settings tab and locked Your stats / Plus settings rows with a glowing Plus tag | ✅ 0.3.0 | ✅ merged, not released |
| 2026-10-07 | Glowing Plus / Coming soon tags | ✅ 0.3.0 | ✅ merged, not released |
| 2026-10-04 | 5-day free trial on monthly and yearly Plus | ✅ 0.2.0+ | ✅ merged, not released |
| 2026-10-05 | Preferred audio language (synced) | ✅ 0.2.0 | ✅ 0.2.0 |
| 2026-10-04 | Setup guide link when no sources are found (a QR code on the Firestick, a link on the phone) | ✅ 0.3.0 | ✅ |

Admin-only changes (the developer panel) are not ported: no TV or phone equivalent.

## The Firestick or phone has it, the web app does not

| Change | Where it is | Web |
|---|---|---|
| Cinemeta added when an account has no addon that offers catalogues (empty Home fix); the server now does this for every app version too (see `addonService.seedDefaultAddon` in the Firestick repo) | Firestick 0.3.1, phone (unreleased) | ⬜ the web app does not check this itself; the server fix covers it once deployed |
| A black Arc TV logo screen at startup while the app loads | Firestick 0.3.0, phone (unreleased) | ⬜ |
| Updates tab with the app version and Check for updates | Firestick 0.3.0, phone | ➖ a website is always the latest |

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
- The player does not ask "Pick up where you left off?" on the Firestick: a part-watched title carries on from its saved spot (it was tried and removed again). The web app asks, with Resume / Start over / Choose a different source.
- Volume is not remembered on the Firestick (on a TV it is the TV's own). The web player remembers the last volume per device. Speed and time left are remembered on both.
