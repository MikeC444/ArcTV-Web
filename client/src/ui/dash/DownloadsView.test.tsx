import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadDetail } from "../../lib/downloadStats";
import * as admin from "../../state/admin";
import { DownloadsView } from "./DownloadsView";

// A plain function (not a spy), so a rejection is only ever seen by the component's own handler.
let answer: () => Promise<DownloadDetail> = async () => detail;
vi.mock("../../state/admin", async (original) => ({ ...(await original<typeof admin>()), fetchDownloadDetail: () => answer() }));

const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, popups: i === 6 ? 8 : 0, opens: i === 6 ? 2 : 0, files: i === 6 ? 1 : 0 }));
const detail: DownloadDetail = {
  days,
  byType: [{ type: "MOVIE", popups: 6, opens: 1, files: 0 }, { type: "TV_SHOW", popups: 2, opens: 1, files: 1 }],
  cached: { cached: 1, uncached: 0, unknown: 0 },
  people: [
    { userId: "u1", email: "free@example.com", displayName: "Free", plan: null, popups: 3, opens: 0, files: 0, episodeFiles: 0, lastAt: new Date().toISOString(), lastKind: "popup", topQuality: null },
    { userId: "u2", email: "plus@example.com", displayName: "Plus", plan: "monthly", popups: 0, opens: 2, files: 1, episodeFiles: 1, lastAt: new Date().toISOString(), lastKind: "file", topQuality: "4K" },
  ],
  recent: [{ kind: "file", contentType: "TV_SHOW", episode: true, resolution: "4K", cached: true, at: new Date().toISOString(), userId: "u2", email: "plus@example.com", displayName: "Plus" }],
};
const summary: admin.AdminSummary = {
  users: 10, newLast7Days: 1, activeLast7Days: 5, plus: { monthly: 1, yearly: 0, lifetime: 0 }, versions: [],
  downloads: { triedPeople: 9, openedPeople: 1, startedPeople: 1, popupPeople: 8, popups: 8, opens: 2, files: 1, episodeFiles: 1, uncachedFiles: 0, byQuality: [{ label: "4K", files: 1 }] },
};

beforeEach(() => { answer = async () => detail; });
afterEach(cleanup);

describe("DownloadsView", () => {
  it("explains each number in words", () => {
    render(<DownloadsView summary={summary} onOpenUser={() => undefined} />);
    expect(screen.getByText("Pressed Download")).toBeInTheDocument();
    expect(screen.getByText("Stopped by the Plus popup")).toBeInTheDocument();
    expect(screen.getByText("Opened the file list")).toBeInTheDocument();
    expect(screen.getByText(/They don't have Plus, so they saw the upgrade popup/)).toBeInTheDocument();
    expect(screen.getByText(/A cancelled or failed download still counts/)).toBeInTheDocument();
  });
  it("lists who is trying and what each did, and can narrow it", async () => {
    render(<DownloadsView summary={summary} onOpenUser={() => undefined} />);
    expect(await screen.findByText("free@example.com")).toBeInTheDocument();
    expect(screen.getByText("plus@example.com", { selector: ".dd-urow__who b" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Pressed a file 1$/ }));
    expect(screen.queryByText("free@example.com")).toBeNull();
    expect(screen.getByText("plus@example.com", { selector: ".dd-urow__who b" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Stopped by the Plus popup 1$/ }));
    expect(screen.getByText("free@example.com")).toBeInTheDocument();
    expect(screen.queryByText("plus@example.com", { selector: ".dd-urow__who b" })).toBeNull();
  });
  it("opens a person from the list and from the latest activity", async () => {
    const open = vi.fn();
    render(<DownloadsView summary={summary} onOpenUser={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open free@example.com" }));
    expect(open).toHaveBeenLastCalledWith("u1");
    fireEvent.click(screen.getByRole("button", { name: /^Plus$/ }));
    expect(open).toHaveBeenLastCalledWith("u2");
    expect(screen.getByText("Pressed a 4K file for an episode (cached)")).toBeInTheDocument();
  });
  it("keeps the live numbers and says so when the detail needs the newer backend", async () => {
    answer = () => Promise.reject(new Error("x"));
    render(<DownloadsView summary={summary} onOpenUser={() => undefined} />);
    expect(await screen.findByText(/needs the newer backend/)).toBeInTheDocument();
    expect(screen.getByText("Pressed Download")).toBeInTheDocument();
  });
});
