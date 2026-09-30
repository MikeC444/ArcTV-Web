# Playback: why some sources never started, and the stream relay

This page records the investigation behind the "select a source → spinner at 0:00 forever" bug, how Stremio Web handles
the same situation, what MangoTV now does, and what has and has not been verified.

## Symptom

Picking a source opens the player, which stays at `0:00 / 0:00` with a spinner. The browser's network tab shows the media
request as *loading* forever, and opening that request's URL in a new tab downloads the file. Copied from the in-app
diagnostics of a real Torrentio / Real-Debrid `.mkv` source (Chrome):

```
network NETWORK_LOADING, ready HAVE_NOTHING, no media error
Events: emptied, waiting, loadstart, stalled@~3.2s      ← no "progress", no "loadedmetadata"
Connection test: plain GET answered in ~1 s · Range GET answered in ~1 s · reading the answer cross-origin: not possible
```

`emptied → waiting → loadstart → stalled` with no `progress` is what Chrome reports when the server has answered a
**browser-style media request** (one carrying `Sec-Fetch-Dest: video`, `Range: bytes=0-`, `Referer`, `Origin` …) with
headers but is withholding the body. The same host answers a plain GET or a Range GET made without those browser
headers immediately, which is why the source works in a download tab and in native players.

## Where it breaks — the trace

| Stage | What MangoTV did | Result |
|---|---|---|
| Stream resolution (`domain/stremio/mapper.ts`) | Kept `url`, `behaviorHints.notWebReady`, `proxyHeaders.request`; dropped `proxyHeaders.response` | Sources resolved correctly |
| Playability (`domain/playability.ts`) | `proxyHeaders` → "can't play here"; `http://` on https → "can't play here" | Playable-through-a-proxy sources were refused up front |
| Playback URL (`Player.tsx`) | `video.src = stream.url`, always | The **only** route to the host is the browser's own media request |
| Player initialisation | Native `<video>` (or hls.js / dash.js) on that URL; a 15 s watchdog reported "no data" | When the host withholds the body from browsers there is no second route, so the user waits and then gets an error |

The defect is therefore not in resolution, the URL or the `<video>` setup: each is correct. It is that the web player has
**exactly one way to fetch media — the browser's own request — and no fallback when a host refuses that request style.**

## How Stremio Web does it

Stremio Web itself plays with `stremio-video` (`HTMLVideo`), which also sets `video.src = url` — the same as MangoTV.
What differs is what sits in front of it (`src/withStreamingServer/convertStream.js` and `buildProxyUrl.js`):

* When a stream carries `behaviorHints.proxyHeaders`, or the page is https and the URL is http, or the stream is not
  web-ready, Stremio rewrites the URL to go through its **streaming server**:
  `<server>/proxy/d=<origin>&h=Header:Value&r=Header:Value/<pathname><search>`
* The streaming server (a process the user runs next to the app, which a static website cannot have) fetches the file
  like a native player would — no browser headers — adds the addon's request headers, applies the addon's response-header
  overrides, and streams the bytes back, including `Range` support.

So Stremio's working logic has two parts: (1) **decide to route through a proxy** and (2) **build the proxy address in a
form that carries the origin, request headers and response headers in the path**. MangoTV had neither.

## What changed

1. **A stream relay on MangoTV's own web server** (`server/src/streamRelay.ts`) — the equivalent of Stremio's `/proxy/`.
   Address shape: `/api/relay/d=<origin>&h=<Header:Value>&r=<Header:Value>/<path>?<query>`, the same shape Stremio uses, so
   the address builder is an adaptation of Stremio's `buildProxyUrl` (MIT, attribution in
   [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)). The server-side relay is original code.
2. **The player routes through it** (`client/src/domain/relay.ts`, `ui/screens/Player.tsx`):
   * sources with `proxyHeaders`, or `http://` on an https page, use the relay from the first request (the Stremio rule);
   * everything else starts **direct** (no bandwidth cost) and switches to the relay **once** if the direct request has
     delivered nothing after 12 s, or fails with a network/unsupported error — never on a decode error, which the relay
     can't fix;
   * if the relay fails too, the error says both routes were tried and **Technical details → Test connection** has a
     fourth probe, "Through this site's relay", showing the HTTP status or the error the stream host returned.
3. **Sources that used to be refused up front** (`proxyHeaders`, plain-http) are now listed as playable, with
   "via this site's relay" in the row detail.

### What the relay does and does not do

Same-origin, signed-in sessions only (`Sec-Fetch-Site: same-origin` when sent; no session → 401), `GET`/`HEAD` only,
http(s) only, no credentials in URLs, and it is **not an open proxy or a general page fetcher**:

* private, loopback, link-local and cloud-metadata addresses are refused at the IP literal **and at connect time**
  (DNS-rebinding safe); every redirect hop is re-validated (≤ 6); the addon's `h` headers go to the first origin only,
  never to a redirect target;
* only media types are relayed (video, audio, octet-stream, HLS, DASH, WebVTT) — HTML/JSON/scripts are refused, so the
  relay can't be used to read or host web pages; responses carry `Content-Disposition: inline`, `nosniff` and a sandboxing
  CSP;
* the upstream request has no cookies, `Referer` or `Origin`, advertises `MangoTV-Web/0.1 (stream relay)` and asks for
  `identity` encoding; forbidden request headers (host, range, sec-*, proxy-*, x-forwarded-* …) in `h` are rejected; `r`
  overrides are limited to `content-type`; a single-range `Range` is passed on so seeking works;
* ≤ 6 concurrent relayed streams per user, upstream aborted when the viewer leaves, timeouts on connect/headers/body;
* `STREAM_RELAY=0` switches it off (404 `relay_disabled`) and the player then behaves exactly as before.

It is a relay for **the user's own addon streams**. It adds no catalogue, no caching and stores nothing.

## Costs and caveats of relaying

* **Bandwidth.** Relayed video flows through the web server. On a free Render plan that counts against its bandwidth
  allowance and is slower than a direct CDN link. That is why direct is tried first and the relay is a fallback.
* **The debrid service sees the server's IP, not the viewer's.** Some services restrict a link to the IP that resolved it,
  or limit simultaneous IPs; a relay keeps it to one (the server's) — but conversely, sharing one site among many people
  who use one debrid account can trip the service's own limits. Decide if that is acceptable for your deployment.
* **HLS through the relay** proxies the playlist and same-origin relative segments. Playlists that point to absolute URLs on
  other hosts are not rewritten, so those segments still go direct.
* **The relay cannot fix what the browser can't decode** (HEVC, Dolby audio, unsupported containers) — the device-support
  badges still apply — and it cannot make an uncached `[RD download]` file start sooner.

## Verification

Reproduced and fixed **with a fixture host that emulates the observed signature** (headers and flush for browser-style
requests, nothing after that; full file for any other client). See `e2e/tests/relay.spec.ts`:

| Case | Before (commit `ee990c9`) | After |
|---|---|---|
| Host withholds the body from browsers | spinner at 0:00, `readyState 0`, `NETWORK_LOADING`, then "no data" error | after 12 s switches route, plays with a real picture, `currentSrc` is `/api/relay/…`, the host saw the relay's UA and no `Referer` |
| Source needs `proxyHeaders` | refused as "can't play here" | listed "via this site's relay"; plays; the browser never contacts the host; the host received the required header |
| Host refuses both routes | generic start-up timeout | error says both routes were tried; diagnostics show `route direct, then relay`; the connection test shows "Through this site's relay: HTTP 502 — The stream host answered HTTP 403" |
| Relay is not an open proxy | — | 401 without a session |

Running `relay.spec.ts` against the pre-fix code fails, which is what shows the fixture really reproduces the problem.
Server-side behaviour (auth, headers, redirects, SSRF guards, media-only, limits) has its own unit tests in
`server/tests/relay.test.ts`.

### Not verified

* **The user's real Torrentio / Real-Debrid stream** — and, per the second round above, the relay alone did **not** fix it. The development sandbox cannot reach `torrentio.strem.fun`,
  Real-Debrid or Stremio hosts, so the exact failure could not be reproduced with the real host. The fixture copies its
  observable signature (Chrome event sequence, plain/Range answered in ~1 s); whether that host answers a server-side
  request depends on the host. If the real cause is an uncached file or a throttled host, the relay will not help — the
  Test connection "Through this site's relay" line and the **cached** badge will tell you which.
* Bandwidth behaviour and performance on Render's free plan.
* HLS through the relay with real multi-host playlists.

## Second round: what the first real test showed

After the relay was deployed, the real Torrentio / Real-Debrid `.mkv` **still did not play**. The technical details of that
attempt:

```
Source: server torrentio.strem.fun, file type .mkv, engine native, route direct, then relay
Video element: network NO_SOURCE, ready HAVE_NOTHING … Media error: SRC_NOT_SUPPORTED   (the relay's JSON error, not a video)
Plain GET … answered after 1381 ms · Range GET … answered after 1019 ms · reading the answer: not possible
Through this site's relay: HTTP 502 — The stream host answered HTTP 403.
```

So the relay does **not** rescue this stream: the host (Torrentio itself, or the debrid CDN it redirects to) refuses a request
from the web server. The first version of the relay could not say which of them, or why; it now reports the host, how many
redirects deep, a couple of well-known headers (`server`, a Cloudflare bot-check marker) and the first words of a text/JSON
error body (links removed). The next failure will therefore name the refuser.

### Two real differences from Stremio Web, read from its source

| | Stremio Web (`stremio-video`) | MangoTV before |
|---|---|---|
| Before `video.src = url` | `getContentType()`: a `HEAD` request (redirects followed); a `application/vnd.apple.mpegurl` answer is played with hls.js **even though the address says `.mkv`** | none — the address alone chose the player |
| What the host sees | a browser with the browser's default referrer policy: `Referer: <the site's origin>` | `Referrer-Policy: same-origin` since the first version → **no Referer to any stream host, ever** |
| `crossOrigin` on the `<video>` | not set (the line is commented out) | not set — same |

Both were changed: `client/src/domain/contentType.ts` (adapted from `getContentType.js`, MIT — the wait is capped at 4 s,
and an unreadable answer falls back to the address exactly as Stremio does) and the server now sends
`Referrer-Policy: strict-origin-when-cross-origin`. The connection test's probes were changed to send what the player sends,
and gained a "HEAD for the content type" line.

### The hypothesis behind this — **unverified**

Some debrid resolvers answer a request that looks like a web page (it carries a `Referer`) differently from a bare client,
for instance by returning a browser-playable HLS stream instead of the raw file. If Torrentio does that, then (a) a
Referer-less request gets the raw file, which is the stall we saw, and (b) the playable answer is HLS behind an address that
ends in `.mkv`, which only a content-type probe notices. **This could not be checked**: the development sandbox cannot reach
Torrentio or Real-Debrid, and Torrentio's source was not available to read. The end-to-end test named "a resolver link that
looks like an .mp4 but is HLS for browsers" (`e2e/tests/relay.spec.ts`) uses a fixture that *emulates* such a host; it
proves that MangoTV now sends the Referer and plays HLS found behind a file-like address (the test fails without the
Referer), not that Torrentio behaves this way.

If the stream still does not play after this change, the **Technical details** will now say what the content-type probe
saw (`content-type …` in the event list), whether a Referer-bearing HEAD could be read at all, and — for the relay — who
refused it. The remaining suspects are then a host that refuses datacenter addresses (the relay case) or one that really
withholds the video from this browser for a reason that can only be seen on the wire.
