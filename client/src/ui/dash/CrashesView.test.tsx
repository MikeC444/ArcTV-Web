import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as admin from "../../state/admin";
import { CrashesView } from "./CrashesView";

// A plain function (not a spy), so a rejection is only ever seen by the component's own handler.
let answer: () => Promise<admin.CrashDetail> = async () => ({ groups: [], recent: [] });
vi.mock("../../state/admin", async (original) => ({ ...(await original<typeof admin>()), fetchCrashes: () => answer() }));
const respond = (fn: () => Promise<admin.CrashDetail>) => { answer = fn; };

const now = new Date().toISOString();
const report = (over: Partial<admin.CrashReport> = {}): admin.CrashReport => ({
  id: "r1", signature: "sig1", kind: "native_crash", exception: "signal 11 (SIGSEGV)", stackTrace: "Exit reason: native crash\nbacktrace here",
  platform: "fire_tv", appVersion: "0.5.1", deviceModel: "NVIDIA SHIELD Android TV", osVersion: "Android 11 (API 30)", happenedAt: now, createdAt: now,
  userId: "u1", email: "sam@example.com", ...over,
});

afterEach(cleanup);

describe("CrashesView", () => {
  it("groups crashes and opens one to its trace", async () => {
    respond(async () => ({
      groups: [{ signature: "sig1", kind: "native_crash", exception: "signal 11 (SIGSEGV)", count: 3, people: 2, firstAt: now, lastAt: now, versions: ["fire_tv 0.5.1"], devices: ["NVIDIA SHIELD Android TV"] }],
      recent: [report()],
    }));
    render(<CrashesView onOpenUser={() => undefined} />);
    expect(await screen.findByText("By problem")).toBeInTheDocument();
    expect(screen.getByText("3 times · 2 people")).toBeInTheDocument();
    expect(screen.getAllByText("Native crash")).toHaveLength(2);
    expect(screen.getAllByText(/backtrace here/)).toHaveLength(2);
    expect(screen.getByText("Fire TV 0.5.1 · NVIDIA SHIELD Android TV")).toBeInTheDocument(); // the latest report's row
    expect(screen.getByText(/^First .* · Fire TV 0\.5\.1 · NVIDIA SHIELD Android TV$/)).toBeInTheDocument(); // the group's versions and devices
  });
  it("opens the person who sent a report", async () => {
    respond(async () => ({ groups: [], recent: [report()] }));
    const open = vi.fn();
    render(<CrashesView onOpenUser={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "sam@example.com" }));
    expect(open).toHaveBeenCalledWith("u1");
  });
  it("says when a report came from someone signed out", async () => {
    respond(async () => ({ groups: [], recent: [report({ userId: null, email: null })] }));
    render(<CrashesView onOpenUser={() => undefined} />);
    expect(await screen.findByText("Not signed in when it was sent.")).toBeInTheDocument();
  });
  it("says so when there are none", async () => {
    respond(async () => ({ groups: [], recent: [] }));
    render(<CrashesView onOpenUser={() => undefined} />);
    expect(await screen.findByText(/No crashes reported/)).toBeInTheDocument();
  });
  it("says when it could not load", async () => {
    respond(() => Promise.reject(new Error("x")));
    render(<CrashesView onOpenUser={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load crash reports");
  });
});
