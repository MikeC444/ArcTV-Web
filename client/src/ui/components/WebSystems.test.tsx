import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WebSystems } from "./WebSystems";

const systems = [
  { system: "Windows", users: 6, devices: 7 },
  { system: "Android", users: 3, devices: 3 },
  { system: "iOS", users: 1, devices: 1 },
];

describe("WebSystems", () => {
  it("shows a count and a share for each system", () => {
    render(<WebSystems systems={systems} selected="" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Windows/ })).toHaveTextContent("6");
    expect(screen.getByRole("button", { name: /Windows/ })).toHaveTextContent("60%");
    expect(screen.getByRole("button", { name: /Android/ })).toHaveTextContent("30%");
  });

  it("picks a system to filter by, and the same press again clears it", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WebSystems systems={systems} selected="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /iOS/ }));
    expect(onSelect).toHaveBeenLastCalledWith("iOS");
    rerender(<WebSystems systems={systems} selected="iOS" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /iOS/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /iOS/ }));
    expect(onSelect).toHaveBeenLastCalledWith("");
  });

  it("says so when no one is signed in on the website", () => {
    render(<WebSystems systems={[]} selected="" onSelect={() => {}} />);
    expect(screen.getByText(/Nobody is signed in/)).toBeInTheDocument();
  });
});
