import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_POPUP, POPUP_AFTER_MS, POPUP_RETRY_MS, resetPopupSlot, useQueuedPopup } from "./popupQueue";

/** A stand-in popup: opens through the queue, and has a Close button. */
function Fake({ id, eligible = true, priority }: { id: string; eligible?: boolean; priority?: number }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // like the real popups, each shows once
  useQueuedPopup(id, eligible && !shown, open, () => { setShown(true); setOpen(true); }, priority);
  return open ? (
    <div role="dialog" aria-label={id}>
      <button type="button" onClick={() => setOpen(false)}>{`close ${id}`}</button>
    </div>
  ) : null;
}

beforeEach(() => {
  resetPopupSlot();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("popups taking turns", () => {
  it("two popups due in the same moment never both open: one waits for the other to close", () => {
    render(
      <>
        <Fake id="a" />
        <Fake id="b" />
      </>,
    );
    act(() => void vi.advanceTimersByTime(POPUP_AFTER_MS));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(POPUP_RETRY_MS * 5));
    expect(screen.getAllByRole("dialog")).toHaveLength(1); // still just the first

    act(() => screen.getByRole("button", { name: /close a/ }).click());
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(POPUP_RETRY_MS));
    expect(screen.getByRole("dialog", { name: "b" })).toBeInTheDocument();
  });

  it("an app announcement waits for a Plus popup that becomes due a little later", () => {
    const { rerender } = render(
      <>
        <Fake id="app" priority={APP_POPUP} />
        <Fake id="plus" eligible={false} />
      </>,
    );
    act(() => void vi.advanceTimersByTime(POPUP_AFTER_MS - 500)); // the Plus one is still finding out it is due
    rerender(
      <>
        <Fake id="app" priority={APP_POPUP} />
        <Fake id="plus" eligible />
      </>,
    );
    act(() => void vi.advanceTimersByTime(500)); // the app popup's turn comes, but the Plus one outranks it
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(POPUP_AFTER_MS));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "plus" })).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: /close plus/ }).click());
    act(() => void vi.advanceTimersByTime(POPUP_RETRY_MS));
    expect(screen.getByRole("dialog", { name: "app" })).toBeInTheDocument();
  });

  it("waits while any other dialog is open, then shows", () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    render(<Fake id="a" />);
    act(() => void vi.advanceTimersByTime(POPUP_AFTER_MS + POPUP_RETRY_MS * 3));
    expect(screen.queryByRole("dialog", { name: "a" })).toBeNull();
    other.remove();
    act(() => void vi.advanceTimersByTime(POPUP_RETRY_MS));
    expect(screen.getByRole("dialog", { name: "a" })).toBeInTheDocument();
  });

  it("does nothing for a popup that is not eligible", () => {
    render(<Fake id="a" eligible={false} />);
    act(() => void vi.advanceTimersByTime(POPUP_AFTER_MS * 3));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
