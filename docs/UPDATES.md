# Updates log — pick what the Firestick app needs

One sentence per update, newest first. When updating the Firestick app, tick the ones you want to carry over.
**Keep this file current: every new change gets one line at the top** (`- [ ] hash — sentence`). Reverted and removed work is listed too, marked so you can skip it.

## Look and layout
- [ ] (phone detail page) — On phones the title page no longer has a tall empty gap: details, cast and "You may also like" sit right under the buttons, and the back arrow stays on screen while scrolling.
- [ ] (logo in nav) — Top-left of the site now shows the Arc TV mark plus "ArcTV" instead of plain text.
- [ ] (logos) — Arc TV favicon, home-screen icons, install manifest and link-preview image added (transparent artwork; the nav shows the full logo image) (the Firestick needs its own launcher icon and banner).
- [ ] (rebrand) — Mango TV renamed to Arc TV in all visible text and the wordmark (logo images, colours, storage keys and env vars unchanged; the Firestick app needs the same rename and new artwork).
- [ ] 3c512ff — Home hero is shaded along its left and right edges (same soft dark fade as the top bar).
- [ ] f7b188b — Slimmer Home top bar and no hover ring or zoom on the logo.
- [ ] 769bf0f — On desktop Home, the first row's title sits level with the hero's slide dots.
- [ ] 1853db5 — Bigger nav and hero, and the Detail hero now matches the Home hero.
- [ ] 3317cc8 — Home hero pictures are no longer cropped.
- [ ] a8dd936 — Hero has clickable, bigger dots and a slide transition; Sources poster is bigger.
- [ ] 8512e53 — Posters are 8 across at 1920 wide (smaller than the TV size).

## Navigation behaviour
- [ ] (faster tabs) — Home builds only the first 3 rows up front and the rest as you scroll to them, and each row builds 30 posters at first and more as you scroll toward its end, so switching tabs no longer freezes the page for seconds on a phone.
- [ ] (this change) — Moving the mouse to the top of the screen brings the hidden top bar back.
- [ ] (earlier fix) — Clicking the top bar with the mouse no longer keeps it on screen while you scroll (only keyboard / remote focus does).
- [ ] 1da9033 — The top bar comes back as soon as you scroll up.
- [ ] dbf8a97 — The top bar slides away when you scroll down (desktop only).
- [ ] 29a638f — Back buttons return to the exact page, scroll position and row; Continue Watching has no repeats.

## Home and lists
- [ ] (picked for you — Plus, hidden) — Private ArcTV Plus preview: a "Picked for you" Home row ranked from the profile's likes / finished movies / watchlist and Cinemeta genres, directors and cast; Like / Not for me controls; the Plus tab is now hidden until launch. See `docs/RECOMMENDATIONS.md` (feedback is per browser, not synced).
- [ ] (ArcTV Plus tab) — New Settings → ArcTV Plus tab: free-plan status, what Plus adds ("coming soon" perks), how to subscribe, a note that proceeds go back into the platform, Monthly, Yearly and one-time Lifetime plan cards, each with its own button (off until its checkout link and price are set in `client/src/domain/plus.ts`). No payments exist yet.
- [ ] (hero trailer) — The Home hero has a Trailer button right beside Play, styled like the title page's (looked up once per slide, dimmed when a title has no trailer; visitors are asked to sign in).
- [ ] (removed titles stay removed) — Fix: titles removed from My List / Watched no longer reappear after signing back in (the one-time "watched" catch-up from history was re-running on every sign-in; it now runs once per browser and skips removed titles) — the Firestick app may have the same catch-up.
- [ ] (blocked genres) — New Settings → Blocked Genres tab hides chosen genres from Home, Movies, TV Shows, Search, Genres and "You may also like" (stored per browser, not synced; the Firestick would need its own storage).
- [ ] (sort drop-down) — My List's sort is now a "Sort by" drop-down beside the title (same style as the genre drop-down) instead of a row of buttons.
- [ ] 800068e — My List has a "Sort by" row: Recently Added, A–Z, Highest Rated, Newest.
- [ ] b7566d5 — Each title shows in only one Home row.
- [ ] c0c9f2f — The hero's ten titles come from the enabled Home rows.
- [ ] 3d714f5 — Detail shows cast photos and the character each actor plays.

## Select a Source
- [ ] 127d207 — "Recommended" source is always the first row, whatever the filters and sort.
- [ ] 870b0c3 — MKV is no longer marked "should play" and ranks below MP4 / WebM / HLS (browser-only issue).
- [ ] ee990c9 — Shows whether debrid sources are cached and explains the ones that aren't.
- [ ] 12d4f35 — Each source is badged for whether this device can play it, and ranked by that.
- [ ] 7164349 — Shows what each addon answered and tests stream-only addons.
- [ ] bfa7a0f — Bigger poster, no play button on "What are sources?", default sort by size.

## Accounts
- [ ] 637d1a0 — Visitors can browse without an account; sign-in is only asked for on Play, My List, Settings or saving.

## Web-only (probably not needed on Firestick)
- [ ] 7e61356, 9df1932 — Server health check and `TRUST_PROXY` logging so the web host stays awake and logs sign-in rate limits.
- [ ] 5efa351, bd0a840 — Phone-friendly layout with a bottom tab bar and poster-style hero.
- [ ] ea609c5, 531971b — Desktop-sized UI scale (half the TV's size at 1920x1080) and smaller posters.
- [ ] 71c7ce6 — Boot video removed from the web app.
- [ ] 32490c9, 92798dc, cf4a197, 5b7f09e, bad1a43, ed730ab — Browser player stream relay, error diagnosis and referrer rules for sources a browser can't fetch.
- [ ] 2f50b04, b1d3673, 6c8fbeb, 0d82c56 — Player loading fix and "Technical details" panel with connection test.

## Reverted / removed (do not carry over)
- [x] c199670 — Built-in TMDB catalog addon; removed again in f7b188b.
- [x] c5ccbc9 — Server-side Dolby / DTS audio conversion; reverted in 1107547.
- [x] 62628dc — Randomised Home rows on every visit; reverted in 515da95.

## Original build
- 1529e57, 13afa4b, 7c65b09, 31e3118, 3493021 — Initial web server, React client, fixes, tests and docs.
