# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/MangoTV-Live-TV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

| Date | Web change | Notes |
|---|---|---|
| 2 Oct 2026 | "Picked for you" no longer offers titles you have liked (a Like now excludes the title, same as Not for me, finished and Continue Watching). Web PR #4. | The Firestick's `excludedFromPicks` (`data/recommend/PickedForYou.kt`) still only excludes finished, Not for me and Continue Watching titles, so two liked movies can recommend each other there. Needs the same one-line change plus its test; ships in the next Firestick release. |
| 2 Oct 2026 | "Picked for you" follows the profile's genre split and rotates on refresh: the profile's taste is split by primary genre (e.g. 75% horror / 25% other) and places are given out in that proportion (Sainte-Laguë), so minority tastes are in the row; the 5 best picks stay and the other places are drawn (seeded, weighted by score, within each genre, last launch's picks 0.15× as likely) so most of the row changes. Scores and reasons are never altered. Web `domain/recommend/rotation.ts` + `taste.ts`. | The Firestick engine (`data/recommend`) has neither step, so its row is all of the biggest taste and identical every launch. Port `compose`, `seededRandom`, `primaryGenre`, `tasteShares`, the per-genre shortlist quota, save the shown ids per account, pass a per-launch seed and previous ids from `HomeViewModel`, raise the candidate detail limit to 60; ships in the next Firestick release. |
| 2 Oct 2026 | Long-press menu on a "Picked for you" card has **Remove from Picked for you**: keeps the title out of the row without being a Like / Not for me, so no taste signal or score changes. Kept on the device per account. Web `state/pickedDismissed.ts`. | Firestick's `CardActionsMenu` only has Like / Not for me; add the item (shown on Picked for you cards), a small DataStore-backed id set, and include it in `excludedFromPicks`; ships in the next Firestick release. |

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
