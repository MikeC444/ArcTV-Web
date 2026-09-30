import { describe, expect, it, vi } from "vitest";
import { describeContentType, engineForContentType, getContentType } from "./contentType";

const answer = (init: { ok?: boolean; type?: string | null }) => ({ ok: init.ok ?? true, headers: { get: (name: string) => (name === "content-type" ? (init.type ?? null) : null) } }) as unknown as Response;

describe("getContentType (Stremio Web's HEAD probe)", () => {
  it("asks the server with HEAD, without cookies, and reads the bare media type", async () => {
    const fetchImpl = vi.fn(async () => answer({ type: "Application/vnd.apple.mpegurl; charset=utf-8" }));
    expect(await getContentType({}, "https://host.example/resolve/x/file.mkv", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe("application/vnd.apple.mpegurl");
    expect(fetchImpl).toHaveBeenCalledWith("https://host.example/resolve/x/file.mkv", expect.objectContaining({ method: "HEAD", credentials: "omit" }));
  });

  it("trusts the addon's own proxyHeaders.response content-type without any request", async () => {
    const fetchImpl = vi.fn();
    expect(await getContentType({ proxyResponseHeaders: { "Content-Type": "video/mp4" } }, "https://h.example/a", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe("video/mp4");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers null — never throws — when the server can't be read, refuses HEAD, or returns junk", async () => {
    expect(await getContentType({}, "https://h.example/a", { fetchImpl: (async () => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch })).toBeNull();
    expect(await getContentType({}, "https://h.example/a", { fetchImpl: (async () => answer({ ok: false, type: "text/html" })) as unknown as typeof fetch })).toBeNull();
    expect(await getContentType({}, "https://h.example/a", { fetchImpl: (async () => answer({ type: "<script>" })) as unknown as typeof fetch })).toBeNull();
  });

  it("gives up after the wait limit instead of holding the player back", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      const pending = getContentType({}, "https://slow.example/a", { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 3000 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when the player goes away", async () => {
    const controller = new AbortController();
    const fetchImpl = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const pending = getContentType({}, "https://slow.example/a", { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });
    controller.abort();
    expect(await pending).toBeNull();
  });
});

describe("engineForContentType", () => {
  it("finds HLS / DASH behind a file-like address, but never overrides the address itself", () => {
    expect(engineForContentType("application/vnd.apple.mpegurl", "native")).toBe("hls");
    expect(engineForContentType("application/x-mpegurl", "native")).toBe("hls");
    expect(engineForContentType("application/dash+xml", "native")).toBe("dash");
    expect(engineForContentType("video/x-matroska", "native")).toBe("native");
    expect(engineForContentType(null, "native")).toBe("native");
    expect(engineForContentType("video/mp4", "hls")).toBe("hls");
  });
  it("describes what was learned, never the address", () => {
    expect(describeContentType("application/vnd.apple.mpegurl")).toBe("content-type application/vnd.apple.mpegurl");
    expect(describeContentType(null)).toBe("content-type not readable");
  });
});
