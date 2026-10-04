# Developer panel (web)

`/admin`, linked from Settings → Account for accounts the backend flags as admins (`users.is_admin`, set by hand in the database; see the backend's
`docs/ADMIN.md`). Read-only: a summary (users, activity, plans, **which app versions are in use**), a searchable user list, and per user the devices
with their app version, profiles, addons (host and debrid service only, never the key), Continue Watching and recent history. It refreshes itself every
30 seconds, so a device that updates its app shows the new version without a reload.

* The web server proxies three GET paths only (`server/src/routes/admin.ts`: `/api/admin/summary`, `/users`, `/users/:id`) with the sealed-cookie bearer;
  the backend does the admin check and answers everyone else with 404, and the page shows "Page not found" to non-admins.
* `GET /api/auth/session` now includes `isAdmin`; the web server sends `X-ArcTV-App-Version: web` so web sessions show as "Web" in the panel.
