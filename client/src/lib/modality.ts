/**
 * Tracks whether the person is driving the app with a keyboard/remote-style keys or a pointer, exposed as
 * <html data-modality="keyboard|pointer">. The TV-style focus ring is always shown for keyboard focus
 * (:focus-visible); route changes only move focus automatically in keyboard modality, so a mouse user is never
 * surprised by a focus jump.
 */
export type Modality = "keyboard" | "pointer";

export function getModality(): Modality {
  return (document.documentElement.dataset.modality as Modality) === "keyboard" ? "keyboard" : "pointer";
}
export function setModality(modality: Modality): void {
  document.documentElement.dataset.modality = modality;
}

export function installModalityTracking(): () => void {
  setModality("pointer");
  const onKey = (event: KeyboardEvent) => {
    if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) setModality("keyboard");
  };
  const onPointer = () => setModality("pointer");
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPointer, true);
  };
}
