import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppPromoDetail } from "../../lib/appPromoStats";
import * as admin from "../../state/admin";
import { AppPromosView } from "./AppPromosView";

let answer: () => Promise<AppPromoDetail> = async () => detail;
vi.mock("../../state/admin", async (original) => ({ ...(await original<typeof admin>()), fetchAppPromoDetail: () => answer() }));

const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, mac: { shown: 0, downloads: 0 }, windows: { shown: i === 6 ? 3 : 0, downloads: i === 6 ? 1 : 0 } }));
const now = new Date().toISOString();
const detail: AppPromoDetail = {
  days,
  people: [
    { userId: "u1", email: "win@example.com", displayName: "Win", app: "windows", outcome: "download", at: now },
    { userId: "u2", email: "mac@example.com", displayName: "Mac", app: "mac", outcome: "closed", at: now },
  ],
  recent: [{ app: "windows", kind: "download", at: now, userId: "u1", email: "win@example.com", displayName: "Win" }],
};
const summary: admin.AdminSummary = {
  users: 10, newLast7Days: 1, activeLast7Days: 5, plus: { monthly: 0, yearly: 0, lifetime: 0 }, versions: [],
  appPromos: [
    { app: "windows", shownPeople: 3, downloadPeople: 1, closedPeople: 1, shown: 3, downloads: 1, closes: 1 },
    { app: "mac", shownPeople: 2, downloadPeople: 0, closedPeople: 1, shown: 2, downloads: 0, closes: 1 },
  ],
};

beforeEach(() => { answer = async () => detail; });
afterEach(cleanup);

describe("AppPromosView", () => {
  it("shows, per app, how many were shown the popup and how many pressed Get the app or closed it", () => {
    render(<AppPromosView summary={summary} onOpenUser={() => undefined} />);
    expect(screen.getByText("Windows app: shown to")).toBeInTheDocument();
    expect(screen.getByText("Mac app: shown to")).toBeInTheDocument();
    expect(screen.getByText(/pressed Get the app \(33% of those shown it\)/)).toBeInTheDocument();
  });
  it("lists who was offered which app and what they did, and can narrow it to one app", async () => {
    render(<AppPromosView summary={summary} onOpenUser={() => undefined} />);
    await screen.findByText("win@example.com");
    expect(screen.getAllByText("Pressed Get the app").length).toBeGreaterThan(0);
    expect(screen.getByText("Closed it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Mac app/ }));
    expect(screen.queryByText("win@example.com")).toBeNull();
    expect(screen.getByText("mac@example.com")).toBeInTheDocument();
  });
  it("opens a person from the list", async () => {
    const open = vi.fn();
    render(<AppPromosView summary={summary} onOpenUser={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open win@example.com" }));
    expect(open).toHaveBeenCalledWith("u1");
  });
  it("says so when the backend is too old for the numbers", () => {
    render(<AppPromosView summary={{ ...summary, appPromos: undefined }} onOpenUser={() => undefined} />);
    expect(screen.getByText("App popups need the newer backend.")).toBeInTheDocument();
  });
  it("says so when the backend is too old for the detail, and keeps the numbers", async () => {
    answer = async () => { throw new Error("404"); };
    render(<AppPromosView summary={summary} onOpenUser={() => undefined} />);
    await waitFor(() => expect(screen.getByText(/needs the newer backend. The numbers above are still live/)).toBeInTheDocument());
    expect(screen.getByText("Windows app: shown to")).toBeInTheDocument();
  });
});
