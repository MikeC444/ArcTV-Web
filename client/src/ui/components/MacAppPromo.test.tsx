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
