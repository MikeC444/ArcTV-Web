# Playback: what happens when a source won't start

This page records what was learned chasing "I pick a source and the player sits at `0:00` with a spinner", what was wrong in
the first diagnosis, what MangoTV does now, and what has and has not been verified.

## Status

* **The reported Torrentio `.mkv` stream does not play in MangoTV, and the player cannot fix that.** A network capture of the
  failing request shows the stream host *is* answering the browser — but sending the file at a trickle (see below). The
  relay cannot help: that host's Cloudflare front refuses this site's server.
* What the player does about it now: it keeps waiting on the direct request (no longer abandoning it), tells the viewer the
  host is too slow when it gives up, and keeps the evidence in the technical details.
* The stream relay, the content-type probe and the diagnostics are real, tested improvements — for *other* failure types.
  None of them is evidence-backed for the original complaint, and this page says so.

## The evidence, in the order it arrived

1. **First reports (diagnostics from the browser).** `emptied → waiting → loadstart → stalled`, no `progress`, `readyState 0`,
   and a connection test where a plain GET and a Range GET both "answered" in about a second. **Wrong inference drawn from
   this:** that the host sent headers and then withheld the body from browser-style requests. A `<video>` reports no
   `progress` until it has parsed enough of the file's header, so "bytes arriving slowly" and "nothing arriving" look
   identical from JavaScript. The relay and its 12-second stall fallback were built on that inference.
2. **The relay, tried for real.** Through the relay the stream host answered `HTTP 403` — and once the relay learned to say
   who refused it: *"from torrentio.strem.fun; server: cloudflare; it said: Attention Required! | Cloudflare"*. That is
   Cloudflare's block page on Torrentio's own address: a hosting provider's server is not a person's browser, and it is
   refused. That is the host's access control; the relay does not try to get around it (no pretending to be a browser).
3. **Referer and content-type probe, tried for real.** Stremio Web sends a Referer and asks the server what a stream is
   before playing it. MangoTV did neither, so both were added on a hypothesis that Torrentio answers browsers differently.
   The direct request still did not start. The HEAD probe could not even read the answer (the redirect doesn't allow web
   pages to), which is exactly what Stremio Web would see too. The Referer change was **reverted** (no effect, small privacy
   cost); the content-type probe stays, but only for addresses with no media-file extension (see the table below).
4. **The network capture (Chrome DevTools, filter "Media").** Both attempts look the same:

   | Request | Status | Size | Time |
   |---|---|---|---|
   | Torrentio `…/Run Hide Fight….mkv` | 302 (from cache) | | 2 ms |
   | the debrid service's `requestdl?token=…` | 307 | 0.3 kB | 2.0 s |
   | the file host `bde9aab9-…` | **206 Partial Content** | **94.8 kB** | 7.6 s |
   | *(second attempt)* the file host | 206 | **238 kB** | 10.6 s |

   So nothing is blocked and nothing is withheld: the chain resolves in about two seconds and the file host answers `206` —
   and then delivers only **95–238 kB in 8–11 seconds** — an average of at most 10–25 KB per second, including the wait for the first byte. A browser cannot start an MKV on that: it needs a few MB of the file
   before it can show a frame (and a stream needs ~0.5 MB/s to keep playing). The `502` rows are the relay being refused. The
   player used to give up on this slow-but-alive request after 12 seconds and switch to the relay — which is refused — so
   the person saw "format not supported" for a request that was in fact making (slow) progress.

The likely cause is on the source side — a release few people share, or a file the debrid service is still fetching even
though the addon labels it "cached" — but that cannot be proven from here. **One check separates it from a player problem:**
open the link in a browser tab (it downloads) and look at the download speed in Chrome's downloads bar. If that is also tens
of KB/s, the source is slow and only a different release or source will help; if the tab download is fast, there is more to
find.

5. **"One source plays — an MP4. Every MKV I tried does not."** That points at the container rather than the network. An MP4
   (with its index at the front) lets a browser start after a few hundred kB. An MKV is not a format browsers officially
   support: Chromium opens some, but it has to read far more of the file before it can show a frame, most releases use HEVC or
   Dolby/DTS audio that a browser can't decode, and on a slow host the extra data is the difference between starting and
   spinning. The app had been treating every MKV as "Should play here" in Chromium — an assumption, now corrected: an MKV is
   "Should play here" only when its release name confirms a decodable video codec **and** a usable audio track, otherwise
   "Might not play", and **MP4 / WebM / HLS sources now rank above MKVs** in Recommended and the Quality sort. A start-up
   timeout on an MKV says so. (This is an inference from one person's results plus how browsers work; the codecs inside their
   particular MKVs were not visible to the app, because the release names didn't say.)

## What Stremio Web does, and what was adapted

Read from the source of `@stremio/stremio-video` (MIT) and Stremio Web (GPL-2.0, **not copied**):

| Stremio | MangoTV |
|---|---|
| `video.src = url` on a native `<video>`; `crossOrigin` deliberately not set | same |
| `getContentType()`: a HEAD request before playing; an HLS answer behind a file-like address is played with hls.js | adapted in `client/src/domain/contentType.ts` — only for addresses that don't name a media file (an `.mkv` link is just played: asking first costs the host a request, and for a debrid link a second "generate a download link" call, and the browser's cross-origin rules usually refuse to show the answer anyway — the red "CORS error" row in DevTools); wait capped at 4 s; unreadable → the address decides, like Stremio |
| Streams with `proxyHeaders` (and mixed-content `http://`) go through the streaming server's `/proxy/<origin>&h=…&r=…/<path>` | same address shape, served by MangoTV's own web server: the stream relay (`client/src/domain/relay.ts`, adapted from `buildProxyUrl.js`, MIT — see `THIRD_PARTY_NOTICES.md`) |
| Everything else the streaming server does (transcoding, torrents) | not available to a hosted website |

## The stream relay

`/api/relay/d=<origin>&h=<Header:Value>&r=<Header:Value>/<path>?<query>` (`server/src/streamRelay.ts`) fetches a stream from
the web server, like a native player, and passes the bytes through with `Range` support. It is **not** an open proxy:

* signed-in sessions only, same-origin only (`Sec-Fetch-Site`), `GET`/`HEAD` only, http(s) only, no credentials in URLs;
* private, loopback, link-local and metadata addresses refused at the address **and at connect time**; every redirect hop is
  re-validated (≤ 6); the addon's `h` headers go to the first origin only;
* only media types are relayed (video, audio, octet-stream, HLS, DASH, WebVTT); responses are `nosniff`, sandboxed, `inline`;
* no cookies, `Referer` or `Origin` sent upstream; forbidden request headers rejected; ≤ 6 concurrent streams per user; upstream
  aborted when the viewer leaves; `STREAM_RELAY=0` turns it off.

**When the player uses it:** straight away for sources with `proxyHeaders` or plain `http://` links; and once, after the
browser's own request *fails outright* (the host refuses it — e.g. hotlink protection). A source that is merely slow is not
sent to the relay. **When a host refuses the relay** the error says who and why (host, redirect depth, `server`, a bot-check
marker, the title of an error page or the first words of a text error — links removed), and the details keep what the
direct attempt did.

**What it cannot do:** help a host that refuses servers (Cloudflare-protected addons such as Torrentio; debrid links locked to
the address that asked for them), fix a slow host, or fix a file the browser can't decode. **Costs:** relayed video flows
through the web server's bandwidth (small on Render's free plan) and the stream host sees the server's address.

## Audio compatibility mode

Browsers (Chrome, Edge on most machines, Firefox) can't decode Dolby Digital, Dolby Digital Plus, DTS or TrueHD, so a release with
that sound plays its picture silent. The Sources screen already says "No sound here" for such releases; this mode fixes it.

* **When:** automatically when a source's audio (read from its release name) is something this device can't decode and the picture
  itself is playable; or by hand from the player's Settings ("No sound? Convert audio"), which also covers a silent source whose
  name didn't say. If the server turns out to have no ffmpeg, or the conversion fails, the player says so and plays the source as it is.
* **How:** `GET /api/transcode?src=<relay address>&start=<seconds>` runs ffmpeg on the server. The **video is copied untouched**;
  the audio is decoded and re-encoded as **stereo AAC in MP4** (or **stereo Opus in WebM** when the video is VP8 / VP9 / AV1) and
  streamed as one progressive, fragmented file. ffmpeg reads the source through this server's own relay (over loopback, as the
  same signed-in person), so every relay protection applies unchanged. `GET /api/transcode/info` reports the length and the audio
  tracks (the converted stream states no length of its own).
* **Seeking:** the browser can't seek inside such a stream. The player seeks in place within what has arrived; anywhere else it asks
  for a new stream with `start=` (ffmpeg seeks near the nearest earlier keyframe — so a seek can land a few seconds early) and adds
  that offset to every time it shows or reports. Pausing needs no work: when the browser stops reading, ffmpeg blocks on its output.
* **Limits and costs:** at most `AUDIO_CONVERSION_MAX` conversions at once (default 3) and 2 per person; the older one is stopped when a
  seek replaces it; ffmpeg is stopped when the player goes away or the source stalls for 45 s. Converted video flows through the
  server's bandwidth like the relay's. Audio-only conversion is light on CPU; the video is never re-encoded, so a source whose
  *video* the device can't decode (HEVC in Chrome, say) is not helped. Embedded subtitles are not carried over.
* **Turning it off / bringing your own ffmpeg:** `AUDIO_CONVERSION=0`, or `FFMPEG_PATH=/usr/bin/ffmpeg`.

## Verification

* Unit and server tests cover the relay (auth, headers, redirects, SSRF guards, media-only, limits, refusal reporting), the
  address builder, the content-type probe and the diagnostics.
* Server tests run a real ffmpeg on generated Dolby-audio files (VP8 + AC3 in Matroska, H.264 + E-AC3 in MP4): the output keeps the video, has stereo AAC / Opus, honours `start`, refuses non-relay addresses, and ffmpeg stops when the client leaves. `e2e/tests/audio.spec.ts` plays a VP9 + Dolby Digital file in Chromium (which can't decode Dolby) and checks that sound is decoded, the length shown, and that toggling and seeking work.
* End-to-end (Chromium against fixture hosts, `e2e/tests/relay.spec.ts`, `addons.spec.ts`): a host that refuses browser
  requests is played through the relay with a real picture; `proxyHeaders` sources play through it while the browser never
  contacts the host; a host that refuses both says so; a link with no file extension that redirects to HLS plays with
  hls.js; a host that never delivers is **not** sent to the relay and ends with the "too slow" message.
* These fixtures are **inventions of the test author**. They prove the code paths work, not that any real host behaves that
  way. The real Torrentio/debrid stream could not be reached from the development sandbox at all.

## If a source still won't start

Chrome DevTools → Network → filter **Media** → start the source. For each row note *Status*, *Size* and *Time* (and the
`content-type`, `content-length`, `content-range`, `location` host in its Headers). Redirect, `206` with a tiny size over many
seconds = a slow host; `403`/`401` = refused; `200` with `text/html` = not a video. The **Technical details → Test connection**
output in the player error shows the same from inside the app.
