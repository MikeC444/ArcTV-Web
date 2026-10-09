import { beforeEach, describe, expect, it } from "vitest";
import { usePlusWelcome, welcomeDue, WELCOME_ID } from "./plusWelcome";

beforeEach(() => {
  localStorage.clear();
  usePlusWelcome.getState().reset();
  usePlusWelcome.setState({ shownThisSession: false });
  usePlusWelcome.getState().hydrate("u1");
});

describe("Plus welcome popup rules", () => {
  it("is due for someone who has not seen it, and only once per visit", () => {
    expect(welcomeDue(usePlusWelcome.getState())).toBe(true);
    usePlusWelcome.getState().markShown();
    expect(welcomeDue(usePlusWelcome.getState())).toBe(false);
  });
  it("once seen it stays away, per account, even after a reload", () => {
    usePlusWelcome.getState().markSeen();
    expect(welcomeDue(usePlusWelcome.getState())).toBe(false);
    usePlusWelcome.getState().reset();
    usePlusWelcome.getState().hydrate("u1");
    expect(usePlusWelcome.getState().seen).toBe(WELCOME_ID);
    expect(welcomeDue(usePlusWelcome.getState())).toBe(false);
    usePlusWelcome.getState().hydrate("u2"); // another account has not seen it
    expect(welcomeDue(usePlusWelcome.getState())).toBe(true);
  });
  it("a revised tour (a different id) shows again", () => {
    expect(welcomeDue({ seen: "2026-01-older", shownThisSession: false })).toBe(true);
  });
});
