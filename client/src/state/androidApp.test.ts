import { beforeEach, describe, expect, it } from "vitest";
import { ANDROID_APP_ID, androidAppDue, useAndroidApp } from "./androidApp";

beforeEach(() => {
  localStorage.clear();
  useAndroidApp.getState().reset();
  useAndroidApp.setState({ shownThisSession: false });
  useAndroidApp.getState().hydrate("u1");
});

describe("Android app popup rules", () => {
  it("is due for someone who has not seen it", () => {
    expect(androidAppDue(useAndroidApp.getState())).toBe(true);
  });
  it("is not shown twice in one visit", () => {
    useAndroidApp.getState().markShown();
    expect(androidAppDue(useAndroidApp.getState())).toBe(false);
  });
  it("once seen it stays away for that account, and still shows for another account", () => {
    useAndroidApp.getState().markSeen();
    expect(androidAppDue(useAndroidApp.getState())).toBe(false);
    useAndroidApp.getState().reset();
    useAndroidApp.getState().hydrate("u1");
    expect(useAndroidApp.getState().seen).toBe(ANDROID_APP_ID);
    expect(androidAppDue(useAndroidApp.getState())).toBe(false);
    useAndroidApp.getState().hydrate("u2");
    expect(androidAppDue(useAndroidApp.getState())).toBe(true);
  });
});
