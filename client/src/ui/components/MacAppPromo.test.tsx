import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../state/auth";
import { useMacApp } from "../../state/macApp";
import { MacAppPromo } from "./MacAppPromo";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAuth.setState({ status: "signedIn" } as never);
  useMacApp.getState().reset();
  useMacApp.setState({ shownThisSession: false });
  useMacApp.getState().hydrate("u1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MacAppPromo", () => {
  it("appears a few seconds after landing for a signed-in person on a Mac, and a close keeps it away", () => {
    setUserAgent(MAC_UA);
    render(<MacAppPromo enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.getByText("Arc TV is on your Mac.")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Close")[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useMacApp.getState().seen).not.toBeNull();
  });
  it("never appears on a Windows browser", () => {
    setUserAgent(WIN_UA);
    render(<MacAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("waits while another popup is open", () => {
    setUserAgent(MAC_UA);
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    render(<MacAppPromo enabled />);
    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.queryByText("Arc TV is on your Mac.")).toBeNull();
    other.remove();
    act(() => void vi.advanceTimersByTime(2100));
    expect(screen.getByText("Arc TV is on your Mac.")).toBeTruthy();
  });
});

describe("MacAppPromo download", () => {
  it("the button starts the newest disk image downloading, without leaving the page", async () => {
    setUserAgent(MAC_UA);
    const dmg = "https://github.com/MikeC444/ArcTV-Mac/releases/download/v0.2.0/ArcTV-0.2.0.dmg";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: [{ name: "ArcTV-0.2.0.dmg", browser_download_url: dmg }] }) })));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MacAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    await act(async () => void (await Promise.resolve()));
    fireEvent.click(screen.getByText("Get the Mac app"));
    expect(clicked).toEqual([dmg]);
    expect(open).not.toHaveBeenCalled();
    click.mockRestore();
    open.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("MacAppPromo reports to the developer dashboard", () => {
  const sent: unknown[] = [];
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string, init?: { body?: string }) => {
      if (String(path).includes("player-events/app-promo")) sent.push(JSON.parse(init!.body!));
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says it was shown, then closed", async () => {
    setUserAgent(MAC_UA);
    render(<MacAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    fireEvent.click(screen.getAllByText("Close")[0]!);
    expect(sent).toEqual([{ app: "mac", kind: "shown" }, { app: "mac", kind: "closed" }]);
  });
  it("says it was shown, then that the button was pressed", async () => {
    setUserAgent(MAC_UA);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MacAppPromo enabled />);
    await act(async () => void vi.advanceTimersByTime(4100));
    fireEvent.click(screen.getByText("Get the Mac app"));
    expect(sent).toEqual([{ app: "mac", kind: "shown" }, { app: "mac", kind: "download" }]);
    open.mockRestore();
  });
});
