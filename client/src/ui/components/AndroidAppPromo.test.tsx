import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../state/auth";
import { useAndroidApp } from "../../state/androidApp";
import { AndroidAppPromo } from "./AndroidAppPromo";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAuth.setState({ status: "signedIn" } as never);
  useAndroidApp.getState().reset();
  useAndroidApp.setState({ shownThisSession: false });
  useAndroidApp.getState().hydrate("u1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AndroidAppPromo", () => {
  it("appears a few seconds after landing for a signed-in person on an Android phone, and a close keeps it away", () => {
    setUserAgent(ANDROID_UA);
    render(<AndroidAppPromo enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.getByText("Arc TV is on Android.")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Close")[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useAndroidApp.getState().seen).not.toBeNull();
  });
  it("never appears on a Windows browser", () => {
    setUserAgent(WIN_UA);
    render(<AndroidAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("waits while another popup is open", () => {
    setUserAgent(ANDROID_UA);
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    render(<AndroidAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.queryByText("Arc TV is on Android.")).toBeNull();
    other.remove();
    act(() => void vi.advanceTimersByTime(2100));
    expect(screen.getByText("Arc TV is on Android.")).toBeTruthy();
  });
});

describe("AndroidAppPromo download", () => {
  it("the button starts the newest app file downloading, without leaving the page", async () => {
    setUserAgent(ANDROID_UA);
    const apk = "https://github.com/MikeC444/ArcTV-MobileAPK/releases/download/v0.5.1/ArcTV-Mobile.apk";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: [{ name: "ArcTV-Mobile.apk", browser_download_url: apk }] }) })));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<AndroidAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    await act(async () => void (await Promise.resolve()));
    fireEvent.click(screen.getByText("Get the Android app"));
    expect(clicked).toEqual([apk]);
    expect(open).not.toHaveBeenCalled();
    click.mockRestore();
    open.mockRestore();
    vi.unstubAllGlobals();
  });
});
