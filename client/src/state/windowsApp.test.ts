import { beforeEach, describe, expect, it } from "vitest";
import { WINDOWS_APP_ID, windowsAppDue, useWindowsApp } from "./windowsApp";

beforeEach(() => {
  localStorage.clear();
  useWindowsApp.getState().reset();
  useWindowsApp.setState({ shownThisSession: false });
  useWindowsApp.getState().hydrate("u1");
});

describe("Windows app popup rules", () => {
  it("is due for someone who has not seen it", () => {
    expect(windowsAppDue(useWindowsApp.getState())).toBe(true);
  });
  it("is not shown twice in one visit", () => {
    useWindowsApp.getState().markShown();
    expect(windowsAppDue(useWindowsApp.getState())).toBe(false);
  });
  it("once seen it stays away for that account, and still shows for another account", () => {
    useWindowsApp.getState().markSeen();
    expect(windowsAppDue(useWindowsApp.getState())).toBe(false);
    useWindowsApp.getState().reset();
    useWindowsApp.getState().hydrate("u1");
    expect(useWindowsApp.getState().seen).toBe(WINDOWS_APP_ID);
    expect(windowsAppDue(useWindowsApp.getState())).toBe(false);
    useWindowsApp.getState().hydrate("u2");
    expect(windowsAppDue(useWindowsApp.getState())).toBe(true);
  });
});
