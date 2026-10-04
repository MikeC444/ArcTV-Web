# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/ArcTV-AndroidTV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

Nothing is missing. The Firestick app has every user-visible web change up to 2026-10-04 (its release notes under `## Unreleased` carry the last eight until they ship; the earlier ones are in 0.1.7).

Two small differences are on purpose: the Firestick does not remember a player volume (on a TV the volume is the TV's own), and the web's Audio row says "Can't be changed for this source here" only where a browser cannot list a plain file's tracks, which a TV player never has to say.

The three "Picked for you" changes (liked titles excluded, genre split + rotation, Remove from Picked for you; ArcTV-AndroidTV Post-Milestone-56) shipped on the Firestick in 0.1.6.

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
