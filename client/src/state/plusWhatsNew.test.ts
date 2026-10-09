import { beforeEach, describe, expect, it } from "vitest";
import { usePlusWhatsNew, whatsNewDue, WHATS_NEW_ID } from "./plusWhatsNew";

beforeEach(() => {
  localStorage.clear();
  usePlusWhatsNew.getState().reset();
  usePlusWhatsNew.setState({ shownThisSession: false });
  usePlusWhatsNew.getState().hydrate("u1");
});

describe("What's new in Plus popup rules", () => {
  it("is due for someone who has not seen it, and only once per visit", () => {
    expect(whatsNewDue(usePlusWhatsNew.getState())).toBe(true);
    usePlusWhatsNew.getState().markShown();
    expect(whatsNewDue(usePlusWhatsNew.getState())).toBe(false);
  });
  it("once seen it stays away, per account, even after a reload", () => {
    usePlusWhatsNew.getState().markSeen();
    expect(whatsNewDue(usePlusWhatsNew.getState())).toBe(false);
    usePlusWhatsNew.getState().reset();
    usePlusWhatsNew.getState().hydrate("u1");
    expect(usePlusWhatsNew.getState().seen).toBe(WHATS_NEW_ID);
    expect(whatsNewDue(usePlusWhatsNew.getState())).toBe(false);
    usePlusWhatsNew.getState().hydrate("u2"); // another account has not seen it
    expect(whatsNewDue(usePlusWhatsNew.getState())).toBe(true);
  });
  it("a later announcement (a different id) shows again", () => {
    expect(whatsNewDue({ seen: "2026-01-older", shownThisSession: false })).toBe(true);
  });
});
