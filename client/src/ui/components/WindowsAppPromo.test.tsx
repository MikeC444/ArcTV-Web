import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../state/auth";
import { useWindowsApp } from "../../state/windowsApp";
import { WindowsAppPromo } from "./WindowsAppPromo";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAuth.setState({ status: "signedIn" } as never);
  useWindowsApp.getState().reset();
  useWindowsApp.setState({ shownThisSession: false });
  useWindowsApp.getState().hydrate("u1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WindowsAppPromo", () => {
  it("appears a few seconds after landing for a signed-in person on Windows, and a close keeps it away", () => {
    setUserAgent(WIN_UA);
    render(<WindowsAppPromo enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.getByText("Arc TV is on your PC.")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Close")[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useWindowsApp.getState().seen).not.toBeNull();
  });
  it("never appears on a Mac browser", () => {
    setUserAgent(MAC_UA);
    render(<WindowsAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("waits while another popup is open", () => {
    setUserAgent(WIN_UA);
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    render(<WindowsAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.queryByText("Arc TV is on your PC.")).toBeNull();
    other.remove();
    act(() => void vi.advanceTimersByTime(2100));
    expect(screen.getByText("Arc TV is on your PC.")).toBeTruthy();
  });
});

describe("WindowsAppPromo download", () => {
  it("the button starts the newest installer downloading, without leaving the page", async () => {
    setUserAgent(WIN_UA);
    const exe = "https://github.com/MikeC444/ArcTV-Windows/releases/download/v0.1.0/ArcTV-Setup-0.1.0.exe";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: [{ name: "ArcTV-Setup-0.1.0.exe", browser_download_url: exe }] }) })));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<WindowsAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    await act(async () => void (await Promise.resolve()));
    fireEvent.click(screen.getByText("Get the Windows app"));
    expect(clicked).toEqual([exe]);
    expect(open).not.toHaveBeenCalled();
    click.mockRestore();
    open.mockRestore();
    vi.unstubAllGlobals();
  });
  it("falls back to the release page when no installer can be found", async () => {
    setUserAgent(WIN_UA);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<WindowsAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    await act(async () => void (await Promise.resolve()));
    fireEvent.click(screen.getByText("Get the Windows app"));
    expect(open).toHaveBeenCalledWith("https://github.com/MikeC444/ArcTV-Windows/releases/latest", "_blank", "noopener");
    open.mockRestore();
    vi.unstubAllGlobals();
  });
});
