import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DOWNLOAD_INVITATION, PromoDialog } from "./PlusPromo";

describe("the Plus popup shown for a Download button", () => {
  it("leads with Downloads and has no 'Don't show me again' link", () => {
    expect(DOWNLOAD_INVITATION.benefits[0]!.title).toBe("Downloads on the web, Mac and Windows");
    const onClose = vi.fn();
    const onGo = vi.fn();
    render(<MemoryRouter><PromoDialog content={DOWNLOAD_INVITATION} onClose={onClose} onGo={onGo} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Downloads come with ArcTV Plus." })).toBeInTheDocument();
    expect(screen.queryByText("Don't show me again")).toBeNull();
    fireEvent.click(screen.getByText(/Take me there/));
    expect(onGo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
