// A tiny, deterministic Stremio-protocol addon used ONLY by the browser tests (and for local demos).
// It speaks the real protocol (manifest / catalog / meta / stream), serves generated poster art and the
// synthetic media in ./media with Range + CORS support, and also exposes a copy of itself WITHOUT CORS
// headers under /nocors to exercise the server-side addon fallback.
//
//   node e2e/fixtures/fake-addon.mjs            # http://127.0.0.1:7000/manifest.json
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleFakeTmdb } from "./fake-tmdb.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.join(here, "media");
export const PORT = Number(process.env.ADDON_PORT ?? 7000);
const BASE = process.env.ADDON_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`;

const GENRES = ["Action", "Comedy", "Drama", "Sci-Fi", "Horror", "Romance"];
const YEAR_OPTIONS = ["2024", "2023"];
const WORDS_A = ["Crimson", "Silent", "Golden", "Broken", "Hidden", "Electric", "Midnight", "Paper", "Iron", "Velvet", "Neon", "Hollow", "Wild", "Distant", "Burning"];
const WORDS_B = ["Harbor", "Empire", "Signal", "Garden", "Horizon", "Machine", "Kingdom", "Letters", "Frontier", "Echo", "Orchard", "Thunder", "Mirror", "Voyage", "Season"];

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function makeItem(kind, i) {
  const r = rand(i * 7919 + (kind === "movie" ? 1 : 2));
  const title = `${WORDS_A[Math.floor(r() * WORDS_A.length)]} ${WORDS_B[Math.floor(r() * WORDS_B.length)]}${i % 5 === 0 ? ` ${Math.floor(r() * 3) + 2}` : ""}`;
  const genres = [...new Set([GENRES[i % GENRES.length], GENRES[Math.floor(r() * GENRES.length)]])];
  const year = 2015 + (i % 10);
  return {
    id: `fx${kind === "movie" ? "m" : "s"}${i}`,
    type: kind === "movie" ? "movie" : "series",
    name: `${title}`,
    releaseInfo: kind === "movie" ? String(year) : `${year}–`,
    imdbRating: (5 + r() * 4.4).toFixed(1),
    genres: [...genres, ...(year >= 2023 ? [String(year)] : [])].filter((g) => !/^\d+$/.test(g)),
    _year: String(year),
    runtime: kind === "movie" ? `${90 + Math.floor(r() * 60)} min` : "45 min",
    description: `A ${genres[0].toLowerCase()} story: ${title} follows an unlikely crew across one impossible season. Generated fixture text for tests — not a real title.`,
    poster: `${BASE}/img/poster/${i}-${kind}.svg`,
    background: `${BASE}/img/bg/${i}-${kind}.svg`,
  };
}

const MOVIES = Array.from({ length: 140 }, (_, i) => makeItem("movie", i + 1));
const SERIES = Array.from({ length: 70 }, (_, i) => makeItem("series", i + 1));
const all = { movie: MOVIES, series: SERIES };

const manifest = {
  id: "test.mangotv.fixture",
  version: "1.0.0",
  name: "Fixture Catalog",
  description: "Local Stremio-protocol test addon (synthetic titles, no real content).",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["fx"],
  catalogs: ["movie", "series"].map((type) => ({
    type,
    id: "top",
    name: "Popular",
    extra: [{ name: "genre", options: [...GENRES, ...YEAR_OPTIONS] }, { name: "search" }, { name: "skip" }],
  })),
};

const preview = ({ _year, ...meta }) => meta;

function cast(i) {
  return ["Ana Whitlock", "Marcus Bell", "Priya Nandakumar", "Tomás Ferreira", "Yuki Tanabe"].slice(0, 3 + (i % 3));
}

function metaFor(type, id) {
  const item = all[type]?.find((m) => m.id === id);
  if (!item) return null;
  const base = { ...preview(item), logo: null, director: ["Sam Okafor"], cast: cast(Number(id.replace(/\D/g, ""))) };
  if (type === "series") {
    base.videos = [];
    for (let s = 1; s <= 3; s++)
      for (let e = 1; e <= 5; e++)
        base.videos.push({ id: `${id}:${s}:${e}`, title: `Chapter ${e}`, season: s, episode: e, overview: `Season ${s}, episode ${e} of ${item.name}.`, thumbnail: `${BASE}/img/bg/${id}-${s}-${e}.svg` });
  }
  return base;
}

function streamsFor(type, id) {
  const title = (all[type]?.find((m) => m.id === id.split(":")[0])?.name ?? "Fixture").replace(/ /g, ".");
  return [
    { name: "Fixture Direct", title: `${title}.2024.720p.WEB-DL.VP9\n👤 250 💾 1.2 GB`, url: `${BASE}/media/sample.webm` },
    { name: "Fixture HLS", title: `${title}.2024.1080p.WEB-DL.VP9\n👤 640 💾 2.4 GB`, url: `${BASE}/media/hls/master.m3u8` },
    { name: "[TB+] Fixture Torrent", title: `${title}.2024.2160p.BluRay.x265.DDP5.1.Atmos\n👤 1500 💾 40 GB`, infoHash: "a".repeat(40) },
    { name: "Fixture MKV", title: `${title}.2024.1080p.BluRay.x264.mkv\n👤 90 💾 8 GB`, url: `${BASE}/media/missing.mkv` },
    { name: "Fixture Web-unready", title: `${title}.2024.480p.HDTV\n👤 10 💾 700 MB`, url: `${BASE}/media/sample.webm?variant=web-unready`, behaviorHints: { notWebReady: true } },
    { name: "Fixture Headers", title: `${title}.2024.1080p.WEB-DL\n👤 30 💾 3 GB`, url: `${BASE}/media/sample.webm?variant=headers`, behaviorHints: { notWebReady: true, proxyHeaders: { request: { Referer: "https://example.invalid/" } } } },
  ];
}

function svg(kind, key) {
  const [a, b] = key.split("-");
  const hash = [...key].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const hue = Math.abs(hash) % 360;
  const [w, h] = kind === "poster" ? [300, 450] : [640, 360];
  const label = `${a}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,38%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},75%,16%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${h * 0.22}" fill="hsla(${(hue + 30) % 360},90%,60%,.25)"/><text x="50%" y="52%" fill="white" fill-opacity=".9" font-family="Roboto,Arial,sans-serif" font-weight="800" font-size="${kind === "poster" ? 34 : 30}" text-anchor="middle">${label}</text><text x="50%" y="62%" fill="white" fill-opacity=".55" font-family="Roboto,Arial,sans-serif" font-size="16" text-anchor="middle">${b ?? ""}</text></svg>`;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges" };
const MIME = { ".webm": "video/webm", ".mkv": "video/x-matroska", ".m3u8": "application/vnd.apple.mpegurl", ".m4s": "video/iso.segment", ".mp4": "video/mp4", ".vtt": "text/vtt" };

/** Every request the addon receives, so tests can prove the web app really asked (GET /__requests, DELETE /__requests). */
const requestLog = [];
/** Media requests with the headers that matter for the relay tests (GET /__media-requests, DELETE to clear). */
const mediaLog = [];

// Extra addons, each mounted under its own prefix. The path segment after /streamonly/ is a "config" like the one real
// debrid addons carry in their URL (characters such as = , | included).
//   /streamonly/<config>/…   stream-only addon (no catalogs) that returns two direct streams
//   /broken/…                declares streams but answers HTTP 500
//   /empty/…                 declares streams but has none for any title
//   /nostreams/…             catalog + meta only, like Cinemeta (must never be asked for streams)
//   /relay/…                 streams whose hosts don't play well with a browser (see the /media/* routes below):
//                              hostile  – refuses a browser-style request (one carrying Sec-Fetch-*) with 403, like hotlink protection, but serves everyone else
//                              headers  – needs the addon's proxyHeaders (X-Required) or answers 403
//                              dead     – answers every client 403
//                              resolver – a link with no file extension that redirects to an HLS stream (what a resolver can look like)
//   /debrid/…                a cached ("[RD+]") and a not-yet-cached ("[RD download]") debrid-style stream
//   /stall/…                 one stream whose media request is accepted and then never answered (a hung debrid link)
const extraManifest = (id, name, resources) => ({ id, name, version: "1.0.0", description: "Local test addon", resources, types: ["movie", "series"], idPrefixes: ["fx"], catalogs: [] });

function handleExtraAddon(p, res, cors) {
  let m = /^\/streamonly\/([^/]+)\/manifest\.json$/.exec(p);
  if (m) {
    const config = decodeURIComponent(m[1]);
    return json(res, extraManifest(`test.mangotv.streamonly.${config.replace(/\W/g, "")}`, `Fixture Streams ${config.split(/[=|,]/)[0]}`, ["stream"]), cors), true;
  }
  m = /^\/streamonly\/([^/]+)\/stream\/(movie|series)\/([^/]+)\.json$/.exec(p);
  if (m) {
    const tag = decodeURIComponent(m[1]).split(/[=|,]/)[0];
    const title = `Extra.${tag}`;
    return json(res, { streams: [
      { name: `Stream ${tag} 1080p`, title: `${title}.1080p.WEB-DL.VP9\n👤 320 💾 2.1 GB`, url: `${BASE}/media/sample.webm?via=${tag}-1` },
      { name: `Stream ${tag} 720p`, title: `${title}.720p.WEB-DL.VP9\n👤 120 💾 1.1 GB`, url: `${BASE}/media/sample.webm?via=${tag}-2` },
    ] }, cors), true;
  }
  if (p === "/relay/manifest.json") return json(res, extraManifest("test.mangotv.relay", "Fixture Relay", ["stream"]), cors), true;
  if (/^\/relay\/stream\//.test(p)) return json(res, { streams: [
    { name: "Stream hostile 1080p", title: "Relay.hostile.1080p.WEB-DL.VP9\n👤 400 💾 2 GB", url: `${BASE}/media/browser-hostile.webm` },
    { name: "Stream headers 1080p", title: "Relay.headers.1080p.WEB-DL.VP9\n👤 300 💾 2 GB", url: `${BASE}/media/needs-headers.webm`, behaviorHints: { proxyHeaders: { request: { "X-Required": "let-me-in" } } } },
    { name: "Stream dead 1080p", title: "Relay.dead.1080p.WEB-DL.VP9\n👤 200 💾 2 GB", url: `${BASE}/media/dead.webm` },
    { name: "Stream resolver 1080p", title: "Relay.resolver.1080p.WEB-DL.VP9\n👤 100 💾 2 GB", url: `${BASE}/media/resolve/movie` },
  ] }, cors), true;
  if (p === "/debrid/manifest.json") return json(res, extraManifest("test.mangotv.debrid", "Fixture Debrid", ["stream"]), cors), true;
  if (/^\/debrid\/stream\//.test(p)) return json(res, { streams: [
    { name: "[RD+] Fixture Debrid", title: "Debrid.cached.1080p.WEB-DL.VP9\n👤 50 💾 2 GB", url: `${BASE}/media/sample.webm?via=debrid-cached` },
    { name: "[RD download] Fixture Debrid", title: "Debrid.uncached.2160p.WEB-DL.VP9\n👤 900 💾 9 GB", url: `${BASE}/media/stall.webm?via=debrid-uncached` },
  ] }, cors), true;
  if (p === "/ac3/manifest.json") return json(res, extraManifest("test.mangotv.ac3", "Fixture Dolby", ["stream"]), cors), true;
  if (/^\/ac3\/stream\//.test(p)) return json(res, { streams: [{ name: "Stream dolby 1080p", title: "Dolby.Movie.1080p.WEB-DL.DD5.1.VP9\n👤 80 💾 1 GB", url: `${BASE}/media/ac3.mkv` }] }, cors), true; // VP9 + Dolby Digital 5.1: the picture plays, the sound can't
  if (p === "/stall/manifest.json") return json(res, extraManifest("test.mangotv.stall", "Fixture Stall", ["stream"]), cors), true;
  if (/^\/stall\/stream\//.test(p)) return json(res, { streams: [{ name: "Stream stall 1080p", title: "Extra.stall.1080p.WEB-DL.VP9\n👤 99 💾 1 GB", url: `${BASE}/media/stall.webm?apikey=SECRET-KEY-123` }] }, cors), true;
  if (p === "/slowdebrid/manifest.json") return json(res, extraManifest("test.mangotv.slowdebrid", "Fixture Slow Debrid", ["stream"]), cors), true;
  if (/^\/slowdebrid\/stream\//.test(p)) return json(res, { streams: [{ name: "[RD+] Fixture Slow", title: "Debrid.slow.1080p.WEB-DL.VP9\n👤 2 💾 2 GB", url: `${BASE}/media/stall.webm?via=debrid-slow` }] }, cors), true; // "cached", but the host never delivers
  if (p === "/broken/manifest.json") return json(res, extraManifest("test.mangotv.broken", "Fixture Broken", ["stream"]), cors), true;
  if (/^\/broken\/stream\//.test(p)) return res.writeHead(500, cors ? CORS : {}), res.end("boom"), true;
  if (p === "/empty/manifest.json") return json(res, extraManifest("test.mangotv.empty", "Fixture Empty", ["stream"]), cors), true;
  if (/^\/empty\/stream\//.test(p)) return json(res, { streams: [] }, cors), true;
  if (p === "/nostreams/manifest.json") return json(res, extraManifest("test.mangotv.nostreams", "Fixture Catalog Only", ["catalog", "meta"]), cors), true;
  if (/^\/nostreams\/stream\//.test(p)) return res.writeHead(404, cors ? CORS : {}), res.end("no such resource"), true;
  m = /^\/nostreams\/meta\/(movie|series)\/([^/]+)\.json$/.exec(p);
  if (m) return json(res, { meta: metaFor(m[1], decodeURIComponent(m[2])) }, cors), true;
  return false;
}

function json(res, body, cors) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...(cors ? CORS : {}) });
  res.end(JSON.stringify(body));
}

function parseExtra(segment) {
  const extra = {};
  for (const part of (segment ?? "").split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    extra[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return extra;
}

function serveFile(req, res, file) {
  if (!file.startsWith(mediaDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, CORS);
    return res.end("not found");
  }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...CORS });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", ...CORS });
  fs.createReadStream(file).pipe(res);
}

export function createAddonServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", BASE);
    let p = url.pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET, HEAD, DELETE, OPTIONS" });
      return res.end();
    }
    // the fake TMDB (and its images) used by the built-in catalog addon tests — kept out of the request log below
    if ((p.startsWith("/tmdb/") || p.startsWith("/tmdb-img/")) && handleFakeTmdb(res, p, url, svg)) return;

    // /nocors/... = the same addon, but without any CORS headers (browsers can't read it directly)
    const cors = !p.startsWith("/nocors/");
    if (!cors) p = p.slice("/nocors".length);

    if (p === "/__media-requests") {
      if (req.method === "DELETE") mediaLog.length = 0;
      return json(res, { requests: mediaLog }, true);
    }
    if (p === "/__requests") {
      if (req.method === "DELETE") requestLog.length = 0;
      return json(res, { requests: requestLog }, true);
    }
    requestLog.push(`${req.method} ${cors ? "" : "/nocors"}${p}`);
    if (p.startsWith("/media/")) mediaLog.push({ path: p, method: req.method, browser: Boolean(req.headers["sec-fetch-dest"]), range: req.headers.range ?? null, referer: req.headers.referer ?? null, required: req.headers["x-required"] ?? null, userAgent: req.headers["user-agent"] ?? null });
    if (handleExtraAddon(p, res, cors)) return;

    if (p === "/manifest.json") return json(res, manifest, cors);
    if (p === "/media/stall.webm") return; // accepted, never answered
    if (p === "/media/browser-hostile.webm" || p === "/media/dead.webm") {
      if (p === "/media/dead.webm" || req.headers["sec-fetch-dest"]) {
        res.writeHead(403, CORS);
        return res.end("forbidden");
      }
      return serveFile(req, res, path.join(mediaDir, "sample.webm"));
    }
    if (p === "/media/resolve/movie") {
      res.writeHead(302, { Location: `${BASE}/media/hls/master.m3u8`, ...CORS });
      return res.end();
    }
    if (p === "/media/needs-headers.webm") {
      if (req.headers["x-required"] !== "let-me-in") {
        res.writeHead(403, CORS);
        return res.end("missing header");
      }
      return serveFile(req, res, path.join(mediaDir, "sample.webm"));
    }
    if (p.startsWith("/media/")) return serveFile(req, res, path.join(mediaDir, decodeURIComponent(p.slice("/media/".length))));

    let m = /^\/img\/(poster|bg)\/(.+)\.svg$/.exec(p);
    if (m) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600", ...CORS });
      return res.end(svg(m[1], m[2]));
    }

    m = /^\/catalog\/(movie|series)\/top(?:\/([^/]+))?\.json$/.exec(p);
    if (m) {
      const extra = parseExtra(m[2] && decodeURIComponent(m[2]));
      let items = all[m[1]];
      if (extra.genre) items = items.filter((i) => i.genres.includes(extra.genre) || i._year === extra.genre);
      if (extra.search) items = items.filter((i) => i.name.toLowerCase().includes(extra.search.toLowerCase()));
      const skip = Number(extra.skip ?? 0);
      return json(res, { metas: items.slice(skip, skip + 100).map(preview) }, cors);
    }

    m = /^\/meta\/(movie|series)\/([^/]+)\.json$/.exec(p);
    if (m) return json(res, { meta: metaFor(m[1], decodeURIComponent(m[2])) }, cors);

    m = /^\/stream\/(movie|series)\/([^/]+)\.json$/.exec(p);
    if (m) return json(res, { streams: streamsFor(m[1], decodeURIComponent(m[2])) }, cors);

    res.writeHead(404, cors ? CORS : {});
    res.end("not found");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAddonServer().listen(PORT, "127.0.0.1", () => console.log(`Fixture addon: ${BASE}/manifest.json`));
}
