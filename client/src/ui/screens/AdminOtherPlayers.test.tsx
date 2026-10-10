import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ExternalPlayerSection } from "./Admin";

const data = {
  opens7d: 2, vlc7d: 5, users7d: 1, afterError7d: 0, fromButton7d: 2, noPlayer7d: 0, opensTotal: 2,
  recent: [{ title: "Show", releaseTitle: null, resolution: "4K", codec: "HEVC", trigger: "button", outcome: "opened", engine: "external", errorMessage: null, appVersion: "0.4.0", createdAt: new Date().toISOString(), email: "a@example.com" }],
};

describe("Other players section", () => {
  beforeEach(() => localStorage.clear());

  it("one Minimise button folds the numbers and the hand-offs together, and Expand brings both back", () => {
    render(<ExternalPlayerSection data={data} />);
    expect(screen.getByText("Opened another app, 7 days")).toBeInTheDocument();
    expect(screen.getByText("Most recent hand-offs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minimise" }));
    expect(screen.queryByText("Opened another app, 7 days")).toBeNull();
    expect(screen.queryByText("Most recent hand-offs")).toBeNull();
    expect(screen.getByRole("heading", { name: "Other players" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Opened another app, 7 days")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Recent hand-offs" })).toBeInTheDocument();
  });

  it("remembers the choice in this browser", () => {
    const first = render(<ExternalPlayerSection data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Minimise" }));
    first.unmount();
    render(<ExternalPlayerSection data={data} />);
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Most recent hand-offs")).toBeNull();
  });
});
