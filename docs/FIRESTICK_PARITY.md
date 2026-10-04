# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/ArcTV-AndroidTV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

- **Settings: long lists in columns** (web, 2026-10-03). On web the subtitle languages (4 across), Home Rows (2 across), the addons list (2 across) and the Plus perks lay out in columns so there is less scrolling. The Firestick got the rest of the Settings redesign (grouped side panel, card with an icon header) but its lists are still one column.

The Firestick got the other web changes of 2026-10-03 on its `main` (ArcTV-AndroidTV Post-Milestone-64 to 67, not in a release yet): Genres removed, the top bar refresh, the Search redesign (without the title-suggestions dropdown) and faster search, the Settings side panel, and the Plus popup.

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
