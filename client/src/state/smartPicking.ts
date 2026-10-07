import { create } from "zustand";
import { readPlayerPrefs, writePlayerPrefs } from "./playerPrefs";

interface SmartPickingState {
  /** Smart source picking is switched on on this device (it only does anything with ArcTV Plus). */
  enabled: boolean;
  setEnabled(enabled: boolean): void;
}

/** Settings → ArcTV Plus → Smart source picking. Kept on this device only, like the other player preferences: what plays well depends on the device. */
export const useSmartPicking = create<SmartPickingState>((set) => ({
  enabled: readPlayerPrefs().smartSourcePicking,
  setEnabled(enabled) {
    writePlayerPrefs({ smartSourcePicking: enabled });
    set({ enabled });
  },
}));
