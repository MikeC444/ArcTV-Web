# Developer panel (web)

`/admin`, linked from Settings → Account for accounts the backend flags as admins (`users.is_admin`, set by hand in the database; see the backend's
`docs/ADMIN.md`). Read-only: a summary (users, activity, plans, **which app versions are in use**), a user list you can filter by email or name, plan, app version, has addons, has Continue Watching and last seen (a filter row under the column headings, "Clear filters" to reset; the filtering is done on the server so it covers every user, not only the rows shown), and per user the devices
with their app version, profiles, addons (host and debrid service only, never the key), Continue Watching and recent history. It refreshes itself every
30 seconds, so a device that updates its app shows the new version without a reload.

* **User growth** (above the app versions): a live line chart of how many accounts exist, one point per day for up to 180 days from the summary's `userGrowth` (UTC days; deleted accounts are counted on no day). Range buttons show 7 / 30 / 90 days or all of it, starting at the first sign-up; hover or the arrow keys read any day (total, new that day), and "View as table" lists the same numbers. It redraws with the panel's 30-second refresh. Hidden on a backend that doesn't send `userGrowth` (the server has to be redeployed first).
* **Other players** (below the app versions): from the summary's `externalPlayer`, how often titles were opened in another app or VLC's engine in the last 7 days (and all-time app opens), how many people, how many came after a playback error vs. the button vs. no player installed, and the 50 most recent hand-offs (title, source quality, which engine, trigger, person, error, app version). Hidden on a backend that doesn't send it.
* Positions in a user's Continue Watching / Recently watched show seconds under a minute ("45s", "0s") and minutes after.
* The X beside "Most recent hand-offs" hides that list in this browser (a "Show" button brings it back); nothing is deleted.
* The web server proxies three GET paths only (`server/src/routes/admin.ts`: `/api/admin/summary`, `/users`, `/users/:id`) with the sealed-cookie bearer;
  the backend does the admin check and answers everyone else with 404, and the page shows "Page not found" to non-admins.
* `GET /api/auth/session` now includes `isAdmin`; the web server sends `X-ArcTV-App-Version: web` so web sessions show as "Web" in the panel.
