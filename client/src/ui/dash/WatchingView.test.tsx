import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "../../state/admin";
import { WatchingView } from "./WatchingView";

// A plain function (not a spy), so a rejection is only ever seen by the component's own handler.
let answer: () => Promise<admin.WatchingList> = async () => ({ windowSeconds: 45, watching: [] });
vi.mock("../../state/admin", async (original) => ({ ...(await original<typeof admin>()), fetchWatching: () => answer() }));
const respond = (fn: () => Promise<admin.WatchingList>) => { answer = fn; };

const row = (over: Partial<admin.WatchingNow> = {}): admin.WatchingNow => ({
  deviceId: "d1", userId: "u1", email: "sam@example.com", displayName: "Sam", platform: "fire_tv", deviceName: "Fire TV Stick", appVersion: "0.5.1",
  lastProgressAt: new Date().toISOString(), title: "Ted Lasso", contentType: "TV_SHOW", seasonNumber: 2, episodeNumber: 4, episodeTitle: "Beard After Hours",
  profileName: "Sam", positionMs: 900_000, durationMs: 3_000_000, ...over,
});

beforeEach(() => respond(async () => ({ windowSeconds: 45, watching: [] })));
afterEach(cleanup);

describe("WatchingView", () => {
  it("shows who is watching, what, and how far in", async () => {
    respond(async () => ({ windowSeconds: 45, watching: [row(), row({ deviceId: "d2", userId: "u2", email: "kim@example.com", displayName: null, platform: "web", appVersion: "web", title: "The Film", contentType: "MOVIE", seasonNumber: null, episodeNumber: null, episodeTitle: null, positionMs: null, durationMs: null })] }));
    render(<WatchingView onOpenUser={() => undefined} />);
    expect(await screen.findByText("Ted Lasso")).toBeInTheDocument();
    expect(screen.getByText("S2 E4 · Beard After Hours")).toBeInTheDocument();
    expect(screen.getByText("Fire TV 0.5.1")).toBeInTheDocument();
    expect(screen.getByText("The Film")).toBeInTheDocument();
    expect(screen.getByText("Movie")).toBeInTheDocument();
    expect(document.querySelector(".dd-watchhead .dd-sub")?.textContent).toContain("2 people on 2 devices");
  });
  it("says so when nobody is watching", async () => {
    respond(async () => ({ windowSeconds: 45, watching: [] }));
    render(<WatchingView onOpenUser={() => undefined} />);
    expect(await screen.findByText(/Nobody is watching right now/)).toBeInTheDocument();
  });
  it("pressing a card opens that person", async () => {
    respond(async () => ({ windowSeconds: 45, watching: [row()] }));
    const open = vi.fn();
    render(<WatchingView onOpenUser={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open sam@example.com" }));
    expect(open).toHaveBeenCalledWith("u1");
  });
  it("does not make up a title it does not know", async () => {
    respond(async () => ({ windowSeconds: 45, watching: [row({ title: null, positionMs: null, durationMs: null, seasonNumber: null, episodeNumber: null, episodeTitle: null })] }));
    render(<WatchingView onOpenUser={() => undefined} />);
    expect(await screen.findByText("Title not known")).toBeInTheDocument();
  });
  it("says when it could not load", async () => {
    respond(() => Promise.reject(new Error("x")));
    render(<WatchingView onOpenUser={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load who is watching");
  });
});
