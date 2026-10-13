import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Guide, GuideChannel } from "../../domain/epg";
import type { LiveChannel } from "../../domain/live";
import { findLiveChannel, resetLiveLineup } from "../../state/liveLineup";
import { LiveGuide } from "./LiveGuide";

const api = vi.hoisted(() => ({ fetchGuide: vi.fn(), fetchGuideSources: vi.fn() }));
vi.mock("../../domain/epg", async (original) => ({ ...(await original<typeof import("../../domain/epg")>()), fetchGuide: api.fetchGuide, fetchGuideSources: api.fetchGuideSources }));

const channel = (id: string, name: string): LiveChannel => ({ id, name, type: "tv", logoUrl: null, shape: "square", description: "", genres: [], providerId: "tv1", providerName: "TV One" });
const nowS = () => Math.floor(Date.now() / 1000);
const row = (c: LiveChannel, titles: Array<[number, number, string, Partial<GuideChannel["programmes"][number]>?]>): GuideChannel => ({
  key: `${c.providerId}|${c.type}|${c.id}`,
  epgId: c.id,
  name: c.name,
  icon: null,
  programmes: titles.map(([from, to, t, extra]) => ({ s: nowS() + from, e: nowS() + to, t, ...extra })),
});
const guideFor = (rows: GuideChannel[], unmatched: string[] = []): Guide => ({ source: "UK1", from: 0, to: 1, updatedAt: 1, channels: rows, unmatched });

const one = channel("c1", "News One");
const two = channel("c2", "Sport Two");
const three = channel("c3", "No Listing");

const renderGuide = (channels = [one, two, three], extra: { onNeedMore?: () => void } = {}) => render(<MemoryRouter><LiveGuide channels={channels} {...extra} /></MemoryRouter>);

beforeEach(() => {
  api.fetchGuide.mockReset();
  api.fetchGuideSources.mockReset();
  api.fetchGuideSources.mockResolvedValue([{ id: "UK1", label: "United Kingdom" }, { id: "US2", label: "United States" }]);
  api.fetchGuide.mockResolvedValue(guideFor([row(one, [[-1800, 1800, "Morning News", { d: "Headlines.", c: "News" }], [1800, 5400, "Weather"]]), row(two, [[-600, 3000, "Live Match", { st: "Final" }]])], ["tv1|tv|c3"]));
  resetLiveLineup();
  localStorage.clear();
  localStorage.setItem("arctv.live.guideSource", "UK1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LiveGuide", () => {
  it("asks for the listed channels' guide times and draws a row for each one it knows, with what is on", async () => {
    renderGuide();
    expect(await screen.findByRole("link", { name: "Watch News One" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch Sport Two" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Watch No Listing" })).toBeNull();
    const request = api.fetchGuide.mock.calls[0]!;
    expect(request[1]).toEqual([{ key: "tv1|tv|c1", name: "News One" }, { key: "tv1|tv|c2", name: "Sport Two" }, { key: "tv1|tv|c3", name: "No Listing" }]);
    const now = screen.getByRole("button", { name: /Morning News/ });
    expect(now).toHaveAttribute("data-now", "true");
    expect(screen.getByRole("button", { name: /Weather/ })).not.toHaveAttribute("data-now");
  });

  it("starts from the country the browser suggests and can be changed, which asks again", async () => {
    localStorage.clear();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    renderGuide();
    await screen.findByRole("link", { name: "Watch News One" });
    expect(api.fetchGuide.mock.calls[0]![0]).toBe("UK1");
    fireEvent.change(screen.getByLabelText("Country for the TV guide"), { target: { value: "US2" } });
    await waitFor(() => expect(api.fetchGuide.mock.calls.some((c) => c[0] === "US2")).toBe(true));
    expect(localStorage.getItem("arctv.live.guideSource")).toBe("US2");
  });

  it("opens a panel for a programme, with a way to watch the channel", async () => {
    renderGuide();
    fireEvent.click(await screen.findByRole("button", { name: /Morning News/ }));
    const panel = screen.getByRole("complementary", { name: "Programme details" });
    expect(panel).toHaveTextContent("Morning News");
    expect(panel).toHaveTextContent("Headlines.");
    expect(panel).toHaveTextContent("on now");
    expect(screen.getByRole("link", { name: /Watch live/ })).toHaveAttribute("href", "/live/watch/tv1/tv/c1");
    fireEvent.click(screen.getByRole("button", { name: /Weather/ }));
    expect(screen.getByRole("link", { name: /Watch channel \(starts/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("counts the channels with no guide times and shows them only when asked", async () => {
    renderGuide();
    await screen.findByRole("link", { name: "Watch News One" });
    expect(screen.getByText(/1 channel has no guide times in United Kingdom/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.getByRole("link", { name: "Watch No Listing" })).toBeInTheDocument();
    expect(screen.getByText("No guide times for this channel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide them" }));
    expect(screen.queryByRole("link", { name: "Watch No Listing" })).toBeNull();
  });

  it("makes the player's next and previous channel follow the rows in the guide", async () => {
    renderGuide();
    await screen.findByRole("link", { name: "Watch News One" });
    expect(findLiveChannel("tv1", "tv", "c1")?.name).toBe("News One");
  });

  it("says so when the guide can't be loaded, and tries again", async () => {
    api.fetchGuide.mockRejectedValueOnce(new Error("down"));
    renderGuide();
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Watch News One" })).toBeInTheDocument();
  });

  it("says so when none of the channels have times in this country", async () => {
    api.fetchGuide.mockResolvedValue(guideFor([], ["tv1|tv|c1", "tv1|tv|c2", "tv1|tv|c3"]));
    renderGuide();
    expect(await screen.findByText(/No guide times were found for these channels in United Kingdom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 3 channels" })).toBeInTheDocument();
  });

  it("still shows the times when React runs its effects twice, as the development build does", async () => {
    render(<StrictMode><MemoryRouter><LiveGuide channels={[one, two, three]} /></MemoryRouter></StrictMode>);
    expect(await screen.findByRole("link", { name: "Watch News One" })).toBeInTheDocument();
  });

  it("does not lose a channel's times when the list grows while the first answer is still on its way", async () => {
    let release!: (g: Guide) => void;
    api.fetchGuide.mockImplementationOnce(() => new Promise<Guide>((resolve) => { release = resolve; }));
    const view = renderGuide([one]);
    await waitFor(() => expect(api.fetchGuide).toHaveBeenCalledTimes(1));
    view.rerender(<MemoryRouter><LiveGuide channels={[one, two]} /></MemoryRouter>);
    await waitFor(() => expect(api.fetchGuide).toHaveBeenCalledTimes(2));
    release(guideFor([row(one, [[-600, 3000, "Slow News"]])]));
    expect(await screen.findByRole("button", { name: /Slow News/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Live Match/ })).toBeInTheDocument();
  });

  it("asks only about channels it has not asked about yet when the list grows", async () => {
    const view = renderGuide([one]);
    await screen.findByRole("link", { name: "Watch News One" });
    expect(api.fetchGuide).toHaveBeenCalledTimes(1);
    view.rerender(<MemoryRouter><LiveGuide channels={[one, two]} /></MemoryRouter>);
    await waitFor(() => expect(api.fetchGuide).toHaveBeenCalledTimes(2));
    expect(api.fetchGuide.mock.calls[1]![1]).toEqual([{ key: "tv1|tv|c2", name: "Sport Two" }]);
  });
});
