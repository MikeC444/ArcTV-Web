import { create } from "zustand";
import type { Content } from "../domain/types";

interface CardMenuState {
  target: Content | null;
  origin: HTMLElement | null;
  open(content: Content): void;
  close(): void;
}

/** CardActionsMenuState — the app-wide long-press menu, so every card everywhere offers it with zero extra plumbing. */
export const useCardMenu = create<CardMenuState>((set, get) => ({
  target: null,
  origin: null,
  open(content) {
    set({ target: content, origin: document.activeElement instanceof HTMLElement ? document.activeElement : null });
  },
  close() {
    const { origin } = get();
    set({ target: null, origin: null });
    // return focus to the card the menu was opened from (keyboard users) — pointer users don't need it
    if (origin && document.documentElement.dataset.modality === "keyboard") requestAnimationFrame(() => origin.focus({ preventScroll: true }));
  },
}));
