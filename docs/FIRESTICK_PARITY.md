# Web changes the Firestick app doesn't have yet

The Firestick app (`MikeC444/ArcTV-AndroidTV`) is kept level with this web app. Whenever a user-visible change lands here
and is NOT made on the Firestick in the same go, add it to **Pending on Firestick** below (what changed, when, why it
matters). When the Firestick gets it, **delete the line**: this list only ever holds what is still missing.

## Pending on Firestick

- **Genres removed** (web, 2026-10-03). The Genres tab is gone from the top navigation and the phone tab bar (Home, Movies, TV Shows, Search, My List, Settings), and the Genres page and genre results pages are removed: /genres and /genres/<name> now send people to Movies. Browse by genre with the genre drop-downs on Movies and TV Shows.
- **Search redesign** (web, 2026-10-03). A rounded search bar with a clear (✕) button; results appear as you type (after a short pause, from 2 letters, no button); **Recent searches** under the bar (last 8, per account, each removable, plus Clear; a search counts once you press Enter, pick a title or open a result); results show in a wrapping Movies / TV Shows poster grid with result counts instead of sideways rows. Faster search (web, 2026-10-03): results show as each addon, and each of its catalogs, answers instead of after the slowest; an addon that hasn't answered in 6 s is left behind ("Still checking other addons…"); typing pause cut from 350 to 250 ms. The title suggestions dropdown is web-only on purpose (see below).
- **Settings redesign** (web, 2026-10-03). Settings now has a grouped side navigation (You / Content / Playback & sound) with the open category's settings in a card beside it, and long lists lay out in columns (subtitle languages, Home Rows, addons, Plus perks) so less scrolling is needed. Layout only: no settings were added or removed.
- **ArcTV Plus popup on Home** (web, 2026-10-03). Once the paywall is on, a signed-in adult without Plus sees a once-per-visit popup a few seconds after landing on Home, listing what Plus adds. Take me there opens Settings → ArcTV Plus; Close hides it for 7 days; Don't show me again ends it for that account (kept per account). Not shown in early access, to kids profiles, or to Plus owners.
Nothing is missing from the Firestick's code. The three "Picked for you" changes (liked titles excluded, genre split + rotation, Remove from Picked for you; ArcTV-AndroidTV Post-Milestone-56) are on its `main` but not in a release yet (0.1.5 doesn't have them), so TVs get them with the next release.

## Firestick-only (not on web, on purpose)

Listed so a difference isn't mistaken for a missed port.

- The marketing site at arctv.org (`landing/`); the app itself is at web.arctv.org. A website has no TV equivalent.
- The Search title-suggestions dropdown (matching titles with thumbnail, type and year under the search bar). On a TV the results already show as posters, so it is not planned.
- Full-screen "Finish payment on your phone" page with a QR code (the web app goes straight to Stripe's own page).
- The Home hero for the next launch is chosen and its pictures downloaded in the background, so the first slide is instant (release 0.1.4).
