# "Picked for you" — ArcTV Plus recommendations (private preview)

A personalised row on Home, built only from ArcTV's own data and Cinemeta. No Trakt, no external AI service, no other metadata provider.
**Not public yet:** it only appears when the hidden Plus preview flag is on (open any page once with `?plusPreview=1`; `?plusPreview=0` switches it off).
With the flag off nothing about it is visible: no row, no Like / Not for me buttons, no Plus tab.

## What it uses
| Signal (per movie, strongest wins, explicit feedback first) | Weight |
|---|---|
| Like | +5 |
| Not for me (dislike) | −5 (stays negative even if finished or saved) |
| Finished (My List entry with `watched`, set by the player's existing completion rule) | +2 |
| On the watchlist, not finished | +1 |

Signals are rebuilt from what is stored *now* each time (`state/recommendations.ts → interactionInputs`), so repeated progress updates cannot inflate anything and edits / removals are reflected. Starting playback, opening a page, failures and interrupted sessions leave no signal. There are no numeric star ratings in the app, so there is nothing to map.

Cinemeta features per movie: genres, directors, cast (`genres`, `director`, `cast`, `app_extras.cast` of the meta response), normalised and de-duplicated; cast is capped at 12 names. A movie's weight is split equally across its unique features **within each category**.

## The score
Cosine similarity between the candidate's feature vector and the profile's preference vector, per category (negative preferences preserved), combined **genre 60 % / director 25 % / cast 15 %**. A category with no candidate metadata or no nonzero profile preference is dropped and the remaining weights renormalised; if nothing can be compared the title is unscored. It is an internal ranking value, not an IMDb rating, star rating or probability, and it is never shown as a percentage.

## Candidates
The movies already listed on the user's Home rows (Cinemeta's popular / featured and per-genre catalogues; no new endpoints). They are pre-ranked by genre from the listing itself, then the top 40 get a detail lookup (directors / cast) through the existing Cinemeta client, 4 at a time, with a persistent per-browser feature cache (800 entries, 30 days). The profile's own movies are looked up the same way (max 60). The shortlist is built from the listing's own genres: 20 by overall genre match, the rest taken round-robin from the best matches of each of the profile's own movies (up to 12), so every taste in the list is represented. Excluded: finished movies, Not-for-me titles, anything in Continue Watching. Watchlisted-but-unfinished (or liked-but-unfinished) titles stay eligible, but such a title is scored against the profile *without itself*, so it can neither boost its own score nor be named as its own reason. Candidates are sorted by score (ties: IMDb rating, then id) and the top **20** go through the separate diversity step below. Having Cinemeta metadata is not proof a stream exists.

## Where to change things
All numbers: `client/src/domain/recommend/config.ts` (signal weights, category weights, result count, cold-start threshold, fetch budgets, cache sizes, row titles).
Logic: `signals.ts` → `preferences.ts` → `score.ts` → `engine.ts` (ranking) and `explain.ts` (reasons). Diversity re-ranking is intentionally not implemented; if added it should be a separate step after `engine.ts`.

## Diversity step (separate from scoring)
`domain/recommend/diversity.ts`, applied after scoring. Going down the score order, each pick is explained by the strongest of its contributing movies that is not yet used up: one of the profile's movies can be the stated reason for at most `MAX_PICKS_PER_SOURCE` (3) picks. Picks whose contributors are all used up only fill spare places at the end. The row stays in score order, but one cluster of taste can't crowd out the rest and every reason still names a movie that really contributed. Tune `MAX_PICKS_PER_SOURCE`, `SHORTLIST_BY_SCORE` and `SHORTLIST_SOURCE_MOVIES` in `config.ts`.

## Explanations
Under each title: "Because you liked / watched / saved X" or "More from directors you enjoy". Each of the profile's movies is credited with the share of *this pick's* score it contributed (weighted over the pick's genres, directors and cast); the movie with the biggest total is cited, ties going to the stronger signal (like, then finished, then saved). So different picks cite different titles, and a lightly-tagged saved movie can't be named for everything. If nothing positive matched there is no reason.

## Cold start
Fewer than 3 interactions (or none positive, or nothing scorable) shows "Popular movies — not personalised yet" (best-rated eligible titles), never presented as personalised.

## Profiles and storage
The app has one implicit profile per account; real profiles are a planned Plus feature. Everything is already keyed by (account, profile) (`state/profile.ts`). Results are cached in memory per profile and invalidated when that profile's signature (feedback + watchlist + finished movies) or the candidate pool changes.

**Feedback sync.** Likes / Not for me are kept in this browser at once (`mtv:v1:profile:<user>:<profile>:feedback`, survives sign-out) **and synced to the account** through the backend's `GET/POST/DELETE /user/feedback` (migration `0015_movie_feedback.sql`, per account **and** per profile, last-write-wins on the change's own timestamp, soft delete: the same rules as My List). Changes are pushed immediately, queued when offline and retried; on sign-in / launch the account's feedback is pulled and merged: something this device had acknowledged that is gone from the account was cleared elsewhere and is dropped; something that only exists here (given offline, or before syncing existed) is sent up; when both differ the newer change wins. Another account on the same browser never sees it, and one profile's feedback never appears under another (the client also ignores any row for a different profile).

**Deploy order.** The backend part lives in the MangoTV-Live-TV repo on branch `feature/movie-feedback-sync` (not merged). Until that is merged, its migration is run and it is deployed, `/user/feedback` answers 404: the web app keeps working, feedback stays on the device and is retried at every launch, so nothing is lost and sync switches on by itself once the backend is live. The web server's allow-list already includes the three feedback paths.

## Controls
Like / Not for me: the card long-press / right-click menu and the title page's "more options" buttons (movies only, Plus preview only). Not for me removes the title from the row immediately.
