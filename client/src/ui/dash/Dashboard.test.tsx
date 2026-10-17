import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSummary } from "../../state/admin";
import { adminPath, parseAdminPath } from "./Dashboard";
import { OverviewView } from "./OverviewView";
import { VersionsView } from "./VersionsView";
import { CommandPalette } from "./CommandPalette";

const summary: AdminSummary = {
  users: 100, newLast7Days: 5, activeLast7Days: 40, plus: { monthly: 3, yearly: 2, lifetime: 1 },
  versions: [{ version: "0.5.1", platform: "fire_tv", devices: 2 }, { version: "0.1.8", platform: "fire_tv", devices: 8 }, { version: "web", platform: "web", devices: 5 }],
  live: { online: { users: 4, byPlatform: { fire_tv: 3, web: 1 } }, watching: { users: 1, byPlatform: { fire_tv: 1 } }, onlineWindowSeconds: 300, watchingWindowSeconds: 45 },
  activity: { active1d: 9, active30d: 70 },
};

afterEach(cleanup);

describe("dashboard addresses", () => {
  it("reads the view and the user from the address, and falls back to the overview", () => {
    expect(parseAdminPath("")).toEqual({ view: "overview", userId: null });
    expect(parseAdminPath(undefined)).toEqual({ view: "overview", userId: null });
    expect(parseAdminPath("playback")).toEqual({ view: "playback", userId: null });
    expect(parseAdminPath("users/abc")).toEqual({ view: "users", userId: "abc" });
    expect(parseAdminPath("nonsense")).toEqual({ view: "overview", userId: null });
  });
  it("writes them back", () => {
    expect(adminPath("overview")).toBe("/admin");
    expect(adminPath("addons")).toBe("/admin/addons");
    expect(adminPath("users", "abc")).toBe("/admin/users/abc");
  });
});

describe("OverviewView", () => {
  it("shows the headline numbers and the live split", () => {
    render(<OverviewView summary={summary} onGo={() => undefined} />);
    expect(screen.getByText("Active this week")).toBeInTheDocument();
    expect(screen.getByText(/9 today/)).toBeInTheDocument();
    expect(screen.getAllByText("Fire TV").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of them is playing something/)).toBeInTheDocument();
  });
  it("lists what needs attention, and pressing it opens the view with the full picture", () => {
    const go = vi.fn();
    render(<OverviewView summary={summary} onGo={go} />);
    const alert = screen.getByRole("button", { name: /device is on an old version|devices are on an old version/ });
    fireEvent.click(alert);
    expect(go).toHaveBeenCalledWith("versions");
  });
});

describe("the Hourly growth switch", () => {
  const hourly = Array.from({ length: 72 }, (_, i) => ({ hour: `2026-10-${String(15 + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00Z`, newUsers: i === 70 ? 6 : 0, total: 100 + (i >= 70 ? 6 : 0) }));
  it("is there with the hourly numbers, and shows the busiest hour and the sign-ups of the last 24 hours", () => {
    render(<OverviewView summary={{ ...summary, userGrowthHourly: hourly }} onGo={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Hourly" }));
    expect(screen.getByText(/new in the last 24 hours/)).toHaveTextContent("busiest hour 22:00 UTC (+6)");
    fireEvent.click(screen.getByRole("button", { name: "72 hours" }));
    expect(screen.getByText(/new in the last 72 hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.queryByText(/new in the last 24 hours/)).not.toBeInTheDocument();
  });
  it("is left out when the backend has no hourly numbers", () => {
    render(<OverviewView summary={summary} onGo={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Hourly" })).not.toBeInTheDocument();
  });
});

describe("VersionsView", () => {
  it("compares each app with its own newest version and lists who is behind", () => {
    const filter = vi.fn();
    render(<VersionsView summary={summary} onFilterUsers={filter} />);
    expect(screen.getByText("8 of 10 (80%) are behind.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show people on Fire TV 0.1.8" }));
    expect(filter).toHaveBeenCalledWith("fire_tv|0.1.8");
  });
});

describe("CommandPalette", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("jumps to a view from the keyboard", async () => {
    const go = vi.fn();
    const close = vi.fn();
    render(<MemoryRouter><CommandPalette onClose={close} onGo={go} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "play" } });
    await act(async () => void vi.advanceTimersByTime(300));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(go).toHaveBeenCalledWith("playback");
    expect(close).toHaveBeenCalled();
  });
  it("closes on Escape", () => {
    const close = vi.fn();
    render(<MemoryRouter><CommandPalette onClose={close} onGo={() => undefined} /></MemoryRouter>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });
});
