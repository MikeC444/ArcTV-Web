# Web changes to carry over to the Firestick and phone apps

Every user-visible change made on the web app is recorded here, newest first, so the same change can be made on the **Firestick**
(`MikeC444/ArcTV-AndroidTV`) and the **phone app** (`MikeC444/ArcTV-MobileAPK`). Nothing is deleted when it is done: a change stays
in the table with its status until both apps have it, then moves to **Done on both** (kept as the record).

Status: ⬜ not done · ✅ done (released or merged) · ➖ not needed there (say why in the notes).

## Web changes to carry over

| Date | Change | Firestick | Phone |
|---|---|---|---|
| 2026-10-10 | One-time "Everything in ArcTV Plus" popup for Plus members on Home: Picked for you, up to 5 profiles, Smart source picking, Your stats, with parental controls on the way; shown once per account (`PlusPromo.tsx`, `plusWelcome.ts`) | ⬜ | ⬜ |
| 2026-10-10 | Remove from Continue Watching no longer marks the title watched: it is taken off and its saved position is forgotten, so playing it again starts from the beginning (needs the new `DELETE /user/continue-watching`; the apps currently send a "finished" report) (`continueWatching.ts`) | ⬜ | ⬜ |
| 2026-10-10 | Remove from Picked for you now hides the title for 5 days, then the algorithm decides again; removals sync across devices through `/user/picked-dismissals` (`pickedDismissed.ts`) | ⬜ | ⬜ |
| 2026-10-09 | Poster menu stays open when My List, Watched, Like or Not for me is pressed; the pressed button turns teal with a tick and says "In My List" / "Watched" (press again to undo) (`CardActionsMenu.tsx`) | ⬜ | ⬜ |
| 2026-10-09 | New Plus settings tab "Recommendations": your Liked and Not for me titles (remove one, or reset all), what shapes your picks, why the last Picked for you titles were chosen, and how it works (`RecommendationsPane.tsx`, `lastPicks.ts`) | ⬜ | ⬜ |
| 2026-10-09 | Picked for you now takes TV shows too: shows you like, save or finish shape the row, shows can be picked, and Like / Not for me appear on shows (menu and details page); ratings sync as TV shows (`recommendations.ts`, `feedback.ts`) | ⬜ | ⬜ |
| 2026-10-09 | Poster menu top: the title's wide backdrop fills the top with the title logo over it (plain title text if there is no logo; small poster and title if there is no backdrop) (`CardActionsMenu.tsx`) | ⬜ | ⬜ |
| 2026-10-09 | Right-click / long-press poster menu redesigned: small poster with the title beside it, big Play (or Resume), a two-by-two grid of My List / Watched / Like / Not for me (ticks show what is set), then View details and Choose source rows, close button, blurred backdrop (`CardActionsMenu.tsx`) | ⬜ | ⬜ |

## Done on both

Home rows in one line: for Cinemeta (and any addon with `top`, `year` and `imdbRating` catalogues) Home shows Popular, New (this year), Top rated, then Action, Comedy, Drama, Thriller, Horror, Sci-Fi, Crime, Animation and Documentary only; each ranking reads page 1 (sometimes 2 or 3; New 1 or 2) chosen by account + day and is gently reshuffled; watched / My List / rated titles are left out of those rows; a title shows in one row; New and Top rated go above rows someone already chose until they place them.

| Date | Change | Firestick | Phone |
|---|---|---|---|
| 2026-10-09 | Home rows: Popular, New, Top rated, nine genres, a different page each day, seen titles hidden (`homeVariety.ts`; `HomeVariety.kt` on the apps) | ✅ merged, not released | ✅ merged, not released |
| 2026-10-09 | Home Rows order: New and Top rated sit above rows someone already chose, until they place them in Settings | ✅ merged, not released | ✅ merged, not released |
| 2026-10-07 | Plus list: the bigger stream relay allowance is removed; the promo names only what is live | ➖ never had it | ➖ never had it (checked) |
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
