import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DownloadSummary } from "../../lib/downloadStats";
import { DownloadStats } from "./DownloadStats";

const data: DownloadSummary = {
  triedPeople: 12, openedPeople: 8, startedPeople: 6, popupPeople: 4, popups: 5, opens: 11, files: 10, episodeFiles: 4, uncachedFiles: 2,
  byQuality: [{ label: "1080p", files: 6 }, { label: "4K", files: 4 }],
};

describe("DownloadStats", () => {
  it("shows who tried, who hit the Plus popup and who pressed a file", () => {
    render(<DownloadStats data={data} />);
    expect(screen.getByText("People who tried").nextSibling?.textContent).toBe("12");
    expect(screen.getByText("Saw the Plus popup").nextSibling?.textContent).toBe("4");
    expect(screen.getByText("Started a download").nextSibling?.textContent).toBe("6");
    expect(screen.getByText(/75% of those who opened it/)).toBeTruthy();
    expect(screen.getByText("1080p")).toBeTruthy();
  });

  it("says nothing yet when no one has used Download", () => {
    render(<DownloadStats data={{ ...data, triedPeople: 0, openedPeople: 0, startedPeople: 0, popupPeople: 0, popups: 0, opens: 0, files: 0, byQuality: [] }} />);
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });
});
