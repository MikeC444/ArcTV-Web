import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GrowthPoint } from "../../lib/growth";
import { GrowthChart } from "./GrowthChart";

const points: GrowthPoint[] = [
  { date: "2026-10-07", newUsers: 0, total: 2 },
  { date: "2026-10-08", newUsers: 10, total: 12 },
  { date: "2026-10-09", newUsers: 20, total: 32 },
  { date: "2026-10-10", newUsers: 8, total: 40 },
];

describe("GrowthChart", () => {
  it("leads with the current total and how many were added", () => {
    render(<GrowthChart points={points} />);
    expect(screen.getByText("40", { selector: ".admin__growthvalue" })).toBeInTheDocument();
    expect(screen.getByText(/\+38 in the last 30 days/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /from 2 to 40/ })).toBeInTheDocument();
  });

  it("reads any day with the arrow keys", () => {
    render(<GrowthChart points={points} />);
    const chart = screen.getByRole("img");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("32");
    expect(screen.getByRole("status")).toHaveTextContent("+20 new");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("status")).toHaveTextContent("no new users");
    fireEvent.blur(chart);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("switches range and to a table of the same numbers", () => {
    render(<GrowthChart points={points} />);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /view as table/i }));
    const table = screen.getByRole("table", { name: "Users per day" });
    expect(table).toHaveTextContent("Oct 10");
    expect(table).toHaveTextContent("+8");
    expect(table).toHaveTextContent("40");
  });

  it("says so when there are no sign-ups yet", () => {
    render(<GrowthChart points={[{ date: "2026-10-10", newUsers: 0, total: 0 }]} />);
    expect(screen.getByText("No sign-ups yet.")).toBeInTheDocument();
  });
});
