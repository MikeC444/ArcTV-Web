import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveChannel } from "../../domain/live";
import type { CatalogProvider } from "../../domain/provider";
import { useProviders } from "../../domain/registry";
import { FEATURES } from "../../lib/features";
import { useHasLiveTv } from "../../state/hooks";
import { resetLiveLineup } from "../../state/liveLineup";
import { useAddons } from "../../state/addons";
import { LiveTvScreen } from "./LiveTv";

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const channel = (id: string, name: string, over: Partial<LiveChannel> = {}): LiveChannel => ({ id, name, type: "tv", logoUrl: null, shape: "square", description: "", genres: [], providerId: "tv1", providerName: "TV One", ...over });
const fakeProvider = (id: string, name: string, channels: LiveChannel[], genres: string[] = []): CatalogProvider =>
  ({
    id,
    name,
    hasLiveTv: true,
    liveGenres: () => genres,
    liveTypes: () => [...new Set(channels.map((c) => c.type))],
    getLiveChannels: vi.fn(async ({ genre, type, page }: { genre?: string; type?: string; page?: number } = {}) => (page && page > 0 ? [] : channels.filter((c) => (!genre || c.genres.includes(genre)) && (!type || c.type === type)))),
    searchLiveChannels: vi.fn(async (q: string) => channels.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))),
  }) as unknown as CatalogProvider;

const renderAt = (path = "/live") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/live" element={<LiveTvScreen />} />
        <Route path="/live/watch/:p/:t/:i" element={<p>watching</p>} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  FEATURES.liveTv = true; // the tab is switched off in the app for now; these tests are about the screen itself
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  useAddons.setState({ ready: true } as never);
  resetLiveLineup();
});
afterEach(() => {
  FEATURES.liveTv = false;
  cleanup();
  vi.unstubAllGlobals();
  useProviders.setState({ providers: [] });
});

describe("LiveTvScreen", () => {
  it("lists the channels of the installed live addons, each a link to watch it", async () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One", { genres: ["News"] }), channel("c2", "Sport Two", { genres: ["Sports"] })], ["News", "Sports"])] });
    renderAt();
    const link = await screen.findByRole("link", { name: "Watch News One" });
    expect(link).toHaveAttribute("href", "/live/watch/tv1/tv/c1");
    expect(screen.getByRole("link", { name: "Watch Sport Two" })).toBeInTheDocument();
  });

  it("filters by category from the chips", async () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One", { genres: ["News"] }), channel("c2", "Sport Two", { genres: ["Sports"] })], ["News", "Sports"])] });
    renderAt();
    await screen.findByRole("link", { name: "Watch News One" });
    fireEvent.click(screen.getByRole("button", { name: "Sports" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Watch News One" })).toBeNull());
    expect(screen.getByRole("link", { name: "Watch Sport Two" })).toBeInTheDocument();
  });

  it("offers Channels and Live events only when both exist, and narrows to one", async () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One"), channel("e1", "Final", { type: "events" })])] });
    renderAt();
    await screen.findByRole("link", { name: "Watch Final" });
    expect(screen.getByRole("link", { name: "Watch Final" }).textContent).toContain("EVENT");
    fireEvent.click(screen.getByRole("button", { name: "Live events" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Watch News One" })).toBeNull());
    expect(screen.getByRole("link", { name: "Watch Final" })).toBeInTheDocument();
  });

  it("searches after a short pause, and says so when nothing matches", async () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One"), channel("c2", "Sport Two")])] });
    renderAt();
    await screen.findByRole("link", { name: "Watch News One" });
    fireEvent.change(screen.getByLabelText("Search channels"), { target: { value: "sport" } });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Watch News One" })).toBeNull(), { timeout: 2000 });
    expect(screen.getByRole("link", { name: "Watch Sport Two" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search channels"), { target: { value: "zzzz" } });
    expect(await screen.findByText("No channels match", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("names the addon on each channel and offers an addon filter when there are two", async () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One")]), fakeProvider("tv2", "TV Two", [channel("d1", "Other News", { providerId: "tv2", providerName: "TV Two" })])] });
    renderAt();
    await screen.findByRole("link", { name: "Watch News One" });
    expect(screen.getByRole("link", { name: "Watch Other News" }).textContent).toContain("TV Two");
    fireEvent.click(screen.getByRole("button", { name: "TV Two" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Watch News One" })).toBeNull());
  });

  it("goes Home when no installed addon has live catalogues", async () => {
    useProviders.setState({ providers: [{ id: "c", name: "Cinemeta" } as unknown as CatalogProvider] });
    await act(async () => void renderAt());
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});

function HasLive() {
  return <p>{useHasLiveTv() ? "tab shown" : "tab hidden"}</p>;
}

describe("the Live TV feature switch", () => {
  it("shows the tab when an addon has live catalogues and the feature is on", () => {
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One")])] });
    render(<HasLive />);
    expect(screen.getByText("tab shown")).toBeInTheDocument();
  });
  it("hides the tab while the feature is off, whatever addons are installed, and the screen sends people Home", async () => {
    FEATURES.liveTv = false;
    useProviders.setState({ providers: [fakeProvider("tv1", "TV One", [channel("c1", "News One")])] });
    render(<HasLive />);
    expect(screen.getByText("tab hidden")).toBeInTheDocument();
    cleanup();
    await act(async () => void renderAt());
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
  it("is off in the app as shipped (a fresh copy of the switch, untouched by these tests)", async () => {
    vi.resetModules();
    expect((await import("../../lib/features")).FEATURES.liveTv).toBe(false);
  });
});
