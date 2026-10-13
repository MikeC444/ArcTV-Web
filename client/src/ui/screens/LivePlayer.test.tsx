import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveChannel } from "../../domain/live";
import type { CatalogProvider, StreamReport } from "../../domain/provider";
import { useProviders } from "../../domain/registry";
import type { Stream } from "../../domain/types";
import { useAddons } from "../../state/addons";
import { resetLiveLineup, setLiveLineup } from "../../state/liveLineup";
import { firstRoute, LivePlayerScreen, nextAttempt } from "./LivePlayer";

const engineMock = vi.hoisted(() => ({ createEngine: vi.fn() }));
vi.mock("../player/engine", async (original) => ({ ...(await original<typeof import("../player/engine")>()), createEngine: engineMock.createEngine }));

const stream = (url: string, over: Partial<Stream> = {}): Stream => ({ id: url, providerId: "tv1", providerLabel: "TV One", resolutionTier: "OTHER", qualityBadge: "", releaseTitle: "", url, ...over }) as Stream;
const channel = (id: string, name: string): LiveChannel => ({ id, name, type: "tv", logoUrl: null, shape: "square", description: "", genres: [], providerId: "tv1", providerName: "TV One" });
const providerWith = (report: StreamReport): CatalogProvider => ({ id: "tv1", name: "TV One", getLiveStreamReport: vi.fn(async () => report) }) as unknown as CatalogProvider;
const ok = (streams: Stream[]): StreamReport => ({ addonName: "TV One", streams, lookup: streams.length ? { kind: "ok", count: streams.length } : { kind: "none" } });

type Callbacks = { onTracks(t: unknown): void; onError(e: { type: string; message: string }): void };
let created: Array<{ kind: string; url: string; cb: Callbacks; destroy: ReturnType<typeof vi.fn> }>;

const renderLive = (path = "/live/watch/tv1/tv/c1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/live/watch/:providerId/:type/:id" element={<LivePlayerScreen />} />
        <Route path="/live" element={<p>channels</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  created = [];
  engineMock.createEngine.mockReset();
  engineMock.createEngine.mockImplementation(async (kind: string, _v: HTMLVideoElement, url: string, cb: Callbacks) => {
    const destroy = vi.fn();
    created.push({ kind, url, cb, destroy });
    return { kind, selectAudio() {}, selectSubtitle() {}, selectQuality() {}, destroy };
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  useAddons.setState({ ready: true } as never);
  resetLiveLineup();
  setLiveLineup([channel("c1", "News One"), channel("c2", "Sport Two")]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useProviders.setState({ providers: [] });
});

describe("nextAttempt", () => {
  const a = stream("https://h/a.m3u8");
  const b = stream("https://h/b.m3u8");
  it("tries the same link through the relay before giving up on it, then the next link, then nothing", () => {
    expect(nextAttempt([a, b], { index: 0, route: "direct" }, { type: "network" })).toEqual({ index: 0, route: "relay" });
    expect(nextAttempt([a, b], { index: 0, route: "relay" }, { type: "network" })).toEqual({ index: 1, route: "direct" });
    expect(nextAttempt([a, b], { index: 1, route: "relay" }, { type: "network" })).toBeNull();
  });
  it("does not send a file the device cannot decode through the relay", () => {
    expect(nextAttempt([a, b], { index: 0, route: "direct" }, { type: "decode" })).toEqual({ index: 1, route: "direct" });
  });
  it("starts through the relay when the browser could not fetch the link itself", () => {
    expect(firstRoute(stream("https://h/a.m3u8"))).toBe("direct");
    expect(firstRoute(stream("https://h/a.m3u8", { proxyHeaders: { Referer: "https://x" } }))).toBe("relay");
    expect(firstRoute(stream("http://h/a.m3u8"))).toBe("direct"); // the test page is http, so no mixed content here
  });
});

describe("LivePlayerScreen", () => {
  it("tunes in to the first playable stream with hls.js and shows the channel as live once the picture is there", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("magnet:?xt=1"), stream("https://h/live/stream.m3u8")]))] });
    renderLive();
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.kind).toBe("hls");
    expect(created[0]!.url).toBe("https://h/live/stream.m3u8");
    expect(screen.getByText(/Tuning in to News One/)).toBeInTheDocument();
    const video = document.querySelector("video")!;
    act(() => void video.dispatchEvent(new Event("playing")));
    expect(screen.queryByText(/Tuning in/)).toBeNull();
    expect(screen.getByText("News One")).toBeInTheDocument();
    expect(screen.getByText(/LIVE/)).toBeInTheDocument();
  });

  it("retries a failed link through the relay, then moves on to the next source", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("https://h/one.m3u8"), stream("https://h/two.m3u8")]))] });
    renderLive();
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]!.cb.onError({ type: "network", message: "x" }));
    await waitFor(() => expect(created).toHaveLength(2));
    expect(created[1]!.url).toContain("/api/relay/");
    act(() => created[1]!.cb.onError({ type: "network", message: "x" }));
    await waitFor(() => expect(created).toHaveLength(3));
    expect(created[2]!.url).toBe("https://h/two.m3u8");
    expect(created[1]!.destroy).toHaveBeenCalled();
  });

  it("falls back to the plain video element when hls.js says it is not HLS", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("https://h/live/abc")]))] });
    renderLive();
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]!.cb.onError({ type: "unsupported", message: "x" }));
    await waitFor(() => expect(created).toHaveLength(2));
    expect(created[1]!.kind).toBe("native");
  });

  it("says the channel is unavailable once every source has failed, and can try again", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("https://h/one.m3u8")]))] });
    renderLive();
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]!.cb.onError({ type: "network", message: "x" }));
    await waitFor(() => expect(created).toHaveLength(2));
    act(() => created[1]!.cb.onError({ type: "network", message: "x" }));
    expect(await screen.findByText("Channel unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to channels/ })).toBeInTheDocument();
  });

  it("says so when the addon offers nothing a browser can play", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("magnet:?xt=1")]))] });
    renderLive();
    expect(await screen.findByText("Channel unavailable")).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });

  it("asks the addon for the channel's name when it is opened by address", async () => {
    resetLiveLineup();
    const provider = { ...providerWith(ok([stream("https://h/live.m3u8")])), getLiveChannel: vi.fn(async () => channel("c1", "Name From Addon")) } as unknown as CatalogProvider;
    useProviders.setState({ providers: [provider] });
    renderLive();
    expect(await screen.findByText(/Tuning in to Name From Addon/)).toBeInTheDocument();
  });

  it("goes to the next and previous channel from the keyboard", async () => {
    useProviders.setState({ providers: [providerWith(ok([stream("https://h/live.m3u8")]))] });
    renderLive();
    await waitFor(() => expect(created).toHaveLength(1));
    fireEvent.keyDown(window, { key: "ArrowUp" });
    await waitFor(() => expect(created.length).toBeGreaterThan(1));
    expect(await screen.findByText(/Tuning in to Sport Two/)).toBeInTheDocument();
  });
});
