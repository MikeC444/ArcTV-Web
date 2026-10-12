import { beforeEach, describe, expect, it } from "vitest";
import { MAC_APP_ID, macAppDue, useMacApp } from "./macApp";

beforeEach(() => {
  localStorage.clear();
  useMacApp.getState().reset();
  useMacApp.setState({ shownThisSession: false });
  useMacApp.getState().hydrate("u1");
});

describe("Mac app popup rules", () => {
  it("is due for someone who has not seen it", () => {
    expect(macAppDue(useMacApp.getState())).toBe(true);
  });
  it("is not shown twice in one visit", () => {
    useMacApp.getState().markShown();
    expect(macAppDue(useMacApp.getState())).toBe(false);
  });
  it("once seen it stays away for that account, and still shows for another account", () => {
    useMacApp.getState().markSeen();
    expect(macAppDue(useMacApp.getState())).toBe(false);
    useMacApp.getState().reset();
    useMacApp.getState().hydrate("u1");
    expect(useMacApp.getState().seen).toBe(MAC_APP_ID);
    expect(macAppDue(useMacApp.getState())).toBe(false);
    useMacApp.getState().hydrate("u2");
    expect(macAppDue(useMacApp.getState())).toBe(true);
  });
});
