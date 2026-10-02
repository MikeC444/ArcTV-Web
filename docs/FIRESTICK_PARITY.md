# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/MangoTV-Live-TV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

| Date | Web change | Notes |
|---|---|---|
| 2 Oct 2026 | "Picked for you" no longer offers titles you have liked (a Like now excludes the title, same as Not for me, finished and Continue Watching). Web PR #4. | The Firestick's `excludedFromPicks` (`data/recommend/PickedForYou.kt`) still only excludes finished, Not for me and Continue Watching titles, so two liked movies can recommend each other there. Needs the same one-line change plus its test; ships in the next Firestick release. |

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
