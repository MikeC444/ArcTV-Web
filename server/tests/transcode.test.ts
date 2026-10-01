import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outputFor, parseProbe, resolveFfmpeg, transcodeArgs } from "../src/transcode.js";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

const FFMPEG = resolveFfmpeg();
const describeIfFfmpeg = FFMPEG ? describe : describe.skip;

describe("reading what ffmpeg says about a file", () => {
  const SAMPLE = `Input #0, matroska,webm, from 'http://127.0.0.1:1/x':
  Duration: 01:42:13.25, start: 0.000000, bitrate: 9000 kb/s
    Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv), 3840x1608, 23.98 fps, 23.98 tbr, 1k tbn (default)
    Stream #0:1(eng): Audio: eac3, 48000 Hz, 5.1(side), fltp, 768 kb/s (default)
    Stream #0:2(fre): Audio: ac3, 48000 Hz, stereo, fltp, 192 kb/s
    Stream #0:3(eng): Subtitle: subrip (default)
At least one output file must be specified`;

  it("finds the length, the first video and every audio track", () => {
    expect(parseProbe(SAMPLE)).toEqual({ durationSeconds: 6133.25, video: "hevc", audio: [{ codec: "eac3", language: "eng" }, { codec: "ac3", language: "fre" }] });
  });

  it("copes with unknown length and with nothing recognisable", () => {
    expect(parseProbe("  Duration: N/A, bitrate: N/A\n    Stream #0:0: Video: h264 (High), yuv420p")).toEqual({ durationSeconds: null, video: "h264", audio: [] });
    expect(parseProbe("Server returned 403 Forbidden")).toEqual({ durationSeconds: null, video: null, audio: [] });
    expect(parseProbe("    Stream #0:1: Video: mjpeg, yuvj420p (attached pic)")).toMatchObject({ video: null });
  });

  it("converts to AAC in MP4 for ordinary video, and to Opus in WebM when the video is VP8 / VP9 / AV1", () => {
    expect(["h264", "hevc", "mpeg4", null].map(outputFor)).toEqual(["mp4", "mp4", "mp4", "mp4"]);
    expect(["vp8", "vp9", "av1"].map(outputFor)).toEqual(["webm", "webm", "webm"]);
    const mp4 = transcodeArgs("http://127.0.0.1:1/a", "Cookie: x\r\n", { output: "mp4" }, { start: 0, audio: 0 });
    expect(mp4).toEqual(expect.arrayContaining(["-c:v", "copy", "-c:a", "aac", "-ac", "2", "-f", "mp4", "pipe:1"]));
    expect(mp4).not.toContain("-ss");
    const webm = transcodeArgs("http://127.0.0.1:1/a", "Cookie: x\r\n", { output: "webm" }, { start: 12.5, audio: 1 });
    expect(webm).toEqual(expect.arrayContaining(["-c:a", "libopus", "-f", "webm", "-ss", "12.500", "0:a:1?"]));
    expect(webm.indexOf("-ss")).toBeLessThan(webm.indexOf("-i")); // seek on the input, so it's fast
  });
});

describeIfFfmpeg("audio compatibility mode (real ffmpeg)", () => {
  let dir: string;
  let upstream: http.Server;
  let base: string;
  let client: ReturnType<typeof agentFor>;
  let server: http.Server;

  const ff = (args: string[]) => execFileSync(FFMPEG as string, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "ignore", timeout: 120_000 });
  const relay = (file: string) => `/api/relay/d=${encodeURIComponent(base)}/${file}`;
  const src = (file: string) => encodeURIComponent(relay(file));
  /** What's inside converted bytes: written to disk and read by ffmpeg again. */
  function inspect(bytes: Buffer, ext: string) {
    const file = path.join(dir, `out-${Date.now()}.${ext}`);
    fs.writeFileSync(file, bytes);
    const out = spawnSync(FFMPEG as string, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr;
    return { out, duration: /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out) };
  }
  const fetchBytes = async (url: string) => {
    const res = await client.get(url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    return { status: res.status, type: res.headers["content-type"], body: res.body as Buffer };
  };

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtv-transcode-"));
    const video = ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=15:duration=8"];
    const sound = (n: number) => ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${n}`];
    // VP8 video + Dolby Digital audio in Matroska — what a Chromium without Dolby support gets silent
    ff([...video, ...sound(8), "-c:v", "libvpx", "-g", "15", "-b:v", "150k", "-c:a", "ac3", "-b:a", "192k", path.join(dir, "ac3.mkv")]);
    // H.264 + Dolby Digital Plus in MP4
    ff([...video, ...sound(8), "-c:v", "libx264", "-g", "15", "-pix_fmt", "yuv420p", "-c:a", "eac3", "-b:a", "192k", path.join(dir, "eac3.mp4")]);
    // a long, small one, to prove stopping early stops ffmpeg
    ff(["-f", "lavfi", "-i", "testsrc=size=64x48:rate=5:duration=900", ...sound(900), "-c:v", "libvpx", "-g", "5", "-b:v", "40k", "-c:a", "ac3", "-b:a", "96k", path.join(dir, "long.mkv")]);

    upstream = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent((req.url ?? "").split("?")[0]!.slice(1)));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      const size = fs.statSync(file).size;
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      const type = file.endsWith(".mp4") ? "video/mp4" : "video/x-matroska";
      if (range) {
        const start = Number(range[1] || 0);
        const end = Math.min(Number(range[2] || size - 1), size - 1);
        res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const app = appWith(backend.fetch, { allowPrivateAddonHosts: true });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    client = agentFor(server as never);
    const login = await client.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    expect(login.status).toBe(200);
  }, 180_000);

  afterAll(async () => {
    await Promise.all([upstream, server].map((s) => new Promise((resolve) => s.close(resolve))));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is for signed-in people on this site only, and refuses addresses that aren't relay addresses", async () => {
    expect((await request(server).get(`/api/transcode/info?src=${src("ac3.mkv")}`)).status).toBe(401);
    expect((await client.get(`/api/transcode/info?src=${src("ac3.mkv")}`).set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    for (const bad of ["http%3A%2F%2Fexample.com%2Fa.mkv", encodeURIComponent("/api/user/watchlist"), encodeURIComponent("/api/relay/d=x\r\nHost: y"), ""]) {
      expect((await client.get(`/api/transcode/info?src=${bad}`)).status, bad).toBe(400);
    }
    expect((await request(server).get(relay("ac3.mkv")).set("X-Mango-Internal", "made-up")).status).toBe(401); // the relay doesn't take a guessed helper token
    expect((await client.get(`/api/transcode?src=${src("ac3.mkv")}&start=-5`)).status).toBe(400);
    expect((await client.get(`/api/transcode?src=${src("ac3.mkv")}&start=abc`)).status).toBe(400);
  });

  it("says what is in a source: length, the video, every audio track — and what it would be converted to", async () => {
    const res = await client.get(`/api/transcode/info?src=${src("ac3.mkv")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ video: "vp8", audio: [{ codec: "ac3" }], output: "webm" });
    expect(res.body.durationSeconds).toBeGreaterThan(7);
    expect(res.body.durationSeconds).toBeLessThan(9);
    const mp4 = await client.get(`/api/transcode/info?src=${src("eac3.mp4")}`);
    expect(mp4.body).toMatchObject({ video: "h264", audio: [{ codec: "eac3" }], output: "mp4" });
  });

  it("turns Dolby Digital into stereo Opus in WebM (VP8 video copied as it is)", async () => {
    const res = await fetchBytes(`/api/transcode?src=${src("ac3.mkv")}`);
    expect(res.status).toBe(200);
    expect(res.type).toBe("video/webm");
    const { out } = inspect(res.body, "webm");
    expect(out).toMatch(/Video: vp8/);
    expect(out).toMatch(/Audio: opus, 48000 Hz, stereo/);
    expect(res.body.length).toBeGreaterThan(20_000); // a live WebM states no length of its own; the player gets it from /info
  }, 60_000);

  it("turns Dolby Digital Plus into stereo AAC in MP4 (H.264 video copied as it is)", async () => {
    const res = await fetchBytes(`/api/transcode?src=${src("eac3.mp4")}`);
    expect(res.status).toBe(200);
    expect(res.type).toBe("video/mp4");
    const { out } = inspect(res.body, "mp4");
    expect(out).toMatch(/Video: h264/);
    expect(out).toMatch(/Audio: aac.*stereo/);
  }, 60_000);

  it("starts later in the file when asked (start=…), so the player can seek", async () => {
    const whole = inspect((await fetchBytes(`/api/transcode?src=${src("eac3.mp4")}`)).body, "mp4");
    const later = inspect((await fetchBytes(`/api/transcode?src=${src("eac3.mp4")}&start=4`)).body, "mp4");
    const seconds = (d: RegExpExecArray | null) => Number(d?.[2]) * 60 + Number(d?.[3]);
    expect(seconds(later.duration)).toBeLessThan(seconds(whole.duration) - 2);
    expect(seconds(later.duration)).toBeGreaterThan(1);
  }, 90_000);

  it("explains a source that can't be read instead of hanging", async () => {
    const res = await client.get(`/api/transcode?src=${src("nothing-here.mkv")}`);
    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/couldn't be read|couldn't be converted/);
  }, 60_000);

  it("stops ffmpeg when the player goes away", async () => {
    const port = (server.address() as AddressInfo).port;
    const running = () => spawnSync("pgrep", ["-f", `127.0.0.1:${port}/api/relay`], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean).length;
    await new Promise<void>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: `/api/transcode?src=${src("long.mkv")}`, headers: { Cookie: (client.agent as unknown as { jar: { getCookies: (o: unknown) => Array<{ toValueString(): string }> } }).jar.getCookies({ domain: "127.0.0.1", path: "/api/", secure: false, script: false }).map((c) => c.toValueString()).join("; ") } }, (res) => {
        expect(res.statusCode).toBe(200);
        res.once("data", () => {
          expect(running()).toBeGreaterThan(0);
          req.destroy(); // like a player that seeks / closes
          resolve();
        });
      });
      req.on("error", () => undefined);
      setTimeout(() => reject(new Error("no data")), 30_000);
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect(running()).toBe(0);
  }, 60_000);
});

describe("audio compatibility mode switched off", () => {
  it("answers 404 transcode_disabled", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const client = agentFor(appWith(backend.fetch, { audioConversion: false }));
    await client.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    const res = await client.get("/api/transcode/info?src=%2Fapi%2Frelay%2Fd%3Dx%2Fa.mkv");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("transcode_disabled");
  });
});
