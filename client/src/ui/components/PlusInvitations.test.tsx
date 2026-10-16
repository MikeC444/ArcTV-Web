import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { usePlusInvite } from "../../state/plusInvite";
import { PICKED_INVITATION, PlusInviteHost, PROFILES_INVITATION, STATS_INVITATION } from "./PlusPromo";

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const host = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <PlusInviteHost />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => usePlusInvite.getState().close());

describe("the Plus popups for locked features", () => {
  it("each leads with the feature the person just pressed and has no 'Don't show me again' link", () => {
    expect(PICKED_INVITATION.benefits[0]!.title).toBe("Picked for you");
    expect(PROFILES_INVITATION.benefits[0]!.title).toBe("Up to 5 profiles");
    expect(STATS_INVITATION.benefits[0]!.title).toBe("Your stats");
  });

  it("draws nothing until a locked feature asks, then shows that feature's popup", () => {
    host();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => usePlusInvite.getState().open("profiles"));
    expect(screen.getByRole("heading", { name: "Give everyone their own profile." })).toBeInTheDocument();
    expect(screen.queryByText("Don't show me again")).toBeNull();
  });

  it("Close dismisses it, and 'Take me there' closes it and goes to the Plus tab", () => {
    host();
    act(() => usePlusInvite.getState().open("picked"));
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => usePlusInvite.getState().open("picked"));
    fireEvent.click(screen.getByText(/Take me there/));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/settings/plus");
  });
});
