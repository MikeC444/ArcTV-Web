# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/ArcTV-AndroidTV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

- **Fresher, tidier Home rows** (web, 2026-10-09; the phone app does not have it either). For Cinemeta (and any addon shaped like it: catalogues `top`, `year` and `imdbRating`), Home shows **Popular, New, Top rated**, then only nine wide-appeal genres (Action, Comedy, Drama, Thriller, Horror, Sci-Fi, Crime, Animation, Documentary), not every genre. Each ranking is read from a different page (100 titles each; mostly page 1, sometimes 2 or 3; New only 1 or 2) chosen by account + day, and gently reshuffled within it favouring the better ranks, so rows are steady all day and differ tomorrow (`domain/homeVariety.ts`, `provider.ts`). Titles already watched, saved to My List or rated (Like / Not for me) are left out of the catalogue rows (they stay in My List, Continue Watching and still count for Picked for you). One title still shows in only one row. Other genres stay on the Movies / TV Shows pages. On the Firestick, `StremioAddonProvider.buildSectionsFlow` still makes one merged row plus every genre, and `HomeViewModel` does not hide seen titles.


## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
- The player does not ask "Pick up where you left off?" on the Firestick: a part-watched title carries on from its saved spot (it was tried and removed again). The web app asks, with Resume / Start over / Choose a different source.
- Volume is not remembered on the Firestick (on a TV it is the TV's own). The web player remembers the last volume per device. Speed and time left are remembered on both.
