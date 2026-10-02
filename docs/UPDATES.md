# Updates log — what the Firestick app needs

One sentence per update. **Keep this file current: every new change gets one line** (`- [ ] hash — sentence`), then it is sorted into one of the sections below.
The sorting is Claude's recommendation for a D-pad TV app (own player, QR sign-in), not a final decision. Move a line between sections to overrule it.

## ✅ Firestick needs these (recommended)
- [ ] (this change) — ArcTV Plus is in early access: the Plus tab, "Picked for you" (labelled "· ArcTV Plus") and Like / Not for me are on for everyone, free for now; the `?plusPreview=1` flag is removed. The Firestick shows the same labels.
- [ ] (this change) — Blocked Genres is now saved to the account's settings (new `blockedGenres` field, shared with the Firestick app) instead of only this browser; a new account adopts the list blocked in the browser before signing in.
- [ ] bc1a55c, 53757a8 — Mango TV renamed to Arc TV in all visible text and the wordmark (logo images, colours, storage keys and env vars unchanged; the Firestick app needs the same rename and new artwork).
- [ ] 590b5d8, 6c818e6 — Arc TV favicon, home-screen icons, install manifest and link-preview image added (transparent artwork; the nav shows the full logo image) (the Firestick needs its own launcher icon and banner).
- [ ] 6c51e99 — Top-left of the site now shows the Arc TV mark plus "ArcTV" instead of plain text.
- [ ] 08bc73a — Whole UI recoloured to the Arc TV logo palette (cyan, blue, violet) instead of the old orange/mango colours.
- [ ] 800068e — My List has a "Sort by" row: Recently Added, A–Z, Highest Rated, Newest.
- [ ] b7566d5 — Each title shows in only one Home row.
- [ ] c0c9f2f — The hero's ten titles come from the enabled Home rows.
- [ ] 29a638f — Back buttons return to the exact page, scroll position and row; Continue Watching has no repeats.
- [ ] 3d714f5 — Detail shows cast photos and the character each actor plays.
- [ ] 701095f, 9cf3490 — TV show pages show the cast (under the seasons), with photos and characters looked up from TMDB when the addon sends names only. (5feb9d8 moved cast above the seasons; reverted in ae13d69.)
- [ ] 127d207 — "Recommended" source is always the first row, whatever the filters and sort.
- [ ] ee990c9 — Shows whether debrid sources are cached and explains the ones that aren't.
- [ ] 7164349 — Shows what each addon answered and tests stream-only addons.
- [ ] 826c753 — Fix: titles removed from My List / Watched no longer reappear after signing back in (the one-time "watched" catch-up from history was re-running on every sign-in; it now runs once per browser and skips removed titles) — the Firestick app may have the same catch-up.
- [ ] b641b28 — Fix: the one-time "watched" catch-up from history now skips any account that already has titles in My List. It used to run again on every new browser or site address (the record of removed titles lives only in the browser that removed them) and put removed movies back with a ✓ — the Firestick app may have the same

## ❓ Maybe — your decision
Hidden or unfinished on the web, a product decision, or needs its own Firestick design.
- [ ] 637d1a0 — Visitors can browse without an account; sign-in is only asked for on Play, My List, Settings or saving.
- [ ] bd49c97 — New Settings → Blocked Genres tab hides chosen genres from Home, Movies, TV Shows, Search, Genres and "You may also like" (stored per browser, not synced; the Firestick would need its own storage).
- [ ] f58e377, 69f2011, c70e94a, 1067fd1, cd18d65 — Private ArcTV Plus preview: a "Picked for you" Home row ranked from the profile's likes / finished movies / watchlist and Cinemeta genres, directors and cast; Like / Not for me controls; the Plus tab is now hidden until launch. See `docs/RECOMMENDATIONS.md` (Like / Not for me now syncs across devices through a new backend endpoint — branch `feature/movie-feedback-sync` in MangoTV-Live-TV, pending merge + migration). Reasons now cite the most similar movie per pick, and a diversity step stops any one movie dominating the row; a movie never picks or explains itself.
- [ ] fbcd56b, 4cdd012, fa77604 — New Settings → ArcTV Plus tab: free-plan status, what Plus adds ("coming soon" perks), how to subscribe, a note that proceeds go back into the platform, Monthly, Yearly and one-time Lifetime plan cards, each with its own button (off until its checkout link and price are set in `client/src/domain/plus.ts`). No payments exist yet.
- [ ] 8f0a884, 1bc2db2, 8d02693 — The Home hero has a Trailer button right beside Play, styled like the title page's (looked up once per slide, dimmed when a title has no trailer; visitors are asked to sign in).
- [ ] e6db839 — Trailer button is always shown on Detail (dimmed when none); a Movies and TV Shows genre drop-down; a menu button on posters for touch screens.
- [ ] 6aef50a, 7a67c0e — Home builds only the first 3 rows up front and the rest as you scroll to them, and each row builds 30 posters at first and more as you scroll toward its end, so switching tabs no longer freezes the page for seconds on a phone.
- [ ] cb140e2, 060d440 — Home hero asks for the largest background picture available and preloads the hero pictures so slides appear instantly.
- [ ] 1853db5 — Bigger nav and hero, and the Detail hero now matches the Home hero.
- [ ] 3317cc8 — Home hero pictures are no longer cropped.
- [ ] bfa7a0f — Bigger poster, no play button on "What are sources?", default sort by size.

## ⛔ Firestick does not need these
Mouse / touch / phone behaviour, desktop layout and scale, browser-only player plumbing, or things the Firestick already does its own way.
- [ ] 3c512ff — Home hero is shaded along its left and right edges (same soft dark fade as the top bar).
- [ ] f7b188b — Slimmer Home top bar and no hover ring or zoom on the logo.
- [ ] 769bf0f — On desktop Home, the first row's title sits level with the hero's slide dots.
- [ ] 8512e53 — Posters are 8 across at 1920 wide (smaller than the TV size).
- [ ] a8dd936 — Hero has clickable, bigger dots and a slide transition; Sources poster is bigger.
- [ ] 11a20b6 — TV show Detail on desktop: gap under the Play row closed, IMDb rating level with it.
- [ ] 0d8a566, 3c22926, e531695, 7254d72 — Desktop top bar made shorter and moved closer to the top of the page (smaller logo, less padding; links stay high).
- [ ] dbf8a97 — The top bar slides away when you scroll down (desktop only).
- [ ] 1da9033 — The top bar comes back as soon as you scroll up.
- [ ] 5c85cd9 — Moving the mouse to the top of the screen brings the hidden top bar back.
- [ ] 3967b34 — Clicking the top bar with the mouse no longer keeps it on screen while you scroll (only keyboard / remote focus does).
- [ ] 6fbd0cf — On phones the title page no longer has a tall empty gap: details, cast and "You may also like" sit right under the buttons, and the back arrow stays on screen while scrolling.
- [ ] bc71264 — My List's sort is now a "Sort by" drop-down beside the title (same style as the genre drop-down) instead of a row of buttons.
- [ ] 870b0c3 — MKV is no longer marked "should play" and ranks below MP4 / WebM / HLS (browser-only issue).
- [ ] 12d4f35 — Each source is badged for whether this device can play it, and ranked by that.
- [ ] 36a9864, 6e4ad65 — "MP4 & web formats" filter (on by default) hides sources the browser can't play, including ones with no audio it can decode (browser-only idea; the Firestick player handles more formats, so probably skip).
- [ ] e04e65a, e279d0a — Log In and Sign Up stay on the same page, and Email & Password is shown first on the sign-in method step.
- [ ] 635862a, ff286ad, e14200b — Round glass hover arrows on Home rows, episode and cast strips so a mouse can scroll them sideways.
- [ ] 21992c8 — Readable title addresses such as /movies/inception-tt1375666.
- [ ] 8028796 — Fix for reloading a player page when the address contains dots.
- [ ] 5d0ebbf — Navigation sound is off by default on the web (the Firestick keeps its own setting).
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
- [x] 5feb9d8 — TV show cast moved above the seasons; reverted in ae13d69.

## Original build
- 1529e57, 13afa4b, 7c65b09, 31e3118, 3493021 — Initial web server, React client, fixes, tests and docs.
