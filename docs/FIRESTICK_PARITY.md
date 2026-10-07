# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/ArcTV-AndroidTV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

- **Setup guide link on the Sources page when there are no sources** (web, 2026-10-04). The "No sources found" page (under Manage Addons) now ends with "New to this? Step-by-step guide to setting up your sources", linking to `/guides/debrid`. On the Firestick, show the same QR code to https://web.arctv.org/guides/debrid there too.
- **Debrid note links to a setup guide: add a QR code** (web, 2026-10-04). Settings → Addons on web ends its debrid note with "Arc TV plays links, not torrents: Step-by-step guide to setting one up", a link to a step-by-step page (`/guides/debrid`: get a debrid service, connect it to Torrentio, add Torrentio to Arc TV; the page is otherwise unlinked). The Firestick still shows the old longer note with no link. A TV can't open a web page, so **show a QR code next to the note that people scan with their phone to open https://web.arctv.org/guides/debrid** (Firestick, and a mobile app if there is one).

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
- The player does not ask "Pick up where you left off?" on the Firestick: a part-watched title carries on from its saved spot (it was tried and removed again). The web app asks, with Resume / Start over / Choose a different source.
- Volume is not remembered on the Firestick (on a TV it is the TV's own). The web player remembers the last volume per device. Speed and time left are remembered on both.
