import { create } from "zustand";

/** Which feature a Plus invitation is about: the one the person just pressed (or finished watching) that needs ArcTV Plus. */
export type PlusInviteKind = "picked" | "profiles" | "stats";

interface InviteState {
  kind: PlusInviteKind | null;
  open(kind: PlusInviteKind): void;
  close(): void;
}

/** The one Plus invitation that may be on screen, opened by a locked feature and drawn by `PlusInviteHost`. */
export const usePlusInvite = create<InviteState>((set) => ({
  kind: null,
  open: (kind) => set({ kind }),
  close: () => set({ kind: null }),
}));
