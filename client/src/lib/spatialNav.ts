import { setModality } from "./modality";
import { playSound } from "./sounds";

/**
 * Directional-key (D-pad style) navigation — an *additional* interaction mode next to mouse, touch and Tab.
 * Arrow keys move focus to the geometrically nearest focusable element in that direction, like the Fire TV remote.
 * It never engages inside text fields / sliders, and any subtree can opt out with data-spatial="off" (the player
 * handles its own keys).
 */
const FOCUSABLE = 'a[href], button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
type Direction = "up" | "down" | "left" | "right";
const KEY_TO_DIRECTION: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const isTextEntry = (el: Element | null): boolean => {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "submit", "reset", "file", "image"].includes(el.type);
  return (el as HTMLElement).isContentEditable;
};

function visibleRect(el: Element): DOMRect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return null;
  if (el.closest("[inert], [aria-hidden='true']")) return null;
  return rect;
}

function score(direction: Direction, from: DOMRect, to: DOMRect): number {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  let major: number;
  let minor: number;
  let overlap: number;
  switch (direction) {
    case "right":
      if (tx <= fx + 1) return Infinity;
      major = Math.max(0, to.left - from.right);
      minor = Math.abs(ty - fy);
      overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
      break;
    case "left":
      if (tx >= fx - 1) return Infinity;
      major = Math.max(0, from.left - to.right);
      minor = Math.abs(ty - fy);
      overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
      break;
    case "down":
      if (ty <= fy + 1) return Infinity;
      major = Math.max(0, to.top - from.bottom);
      minor = Math.abs(tx - fx);
      overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
      break;
    case "up":
      if (ty >= fy - 1) return Infinity;
      major = Math.max(0, from.top - to.bottom);
      minor = Math.abs(tx - fx);
      overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
      break;
  }
  // Elements lined up on the minor axis win over closer-but-offset ones.
  return major * 2 + minor * (overlap > 0 ? 1 : 4) + (overlap > 0 ? 0 : 500);
}

export function findNext(direction: Direction, current: Element, root: ParentNode = document): HTMLElement | null {
  const from = current.getBoundingClientRect();
  let best: { el: HTMLElement; score: number } | null = null;
  root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
    if (el === current || current.contains(el) || el.contains(current)) return;
    if (el.closest('[data-spatial="skip"]')) return;
    const rect = visibleRect(el);
    if (!rect) return;
    const s = score(direction, from, rect);
    if (s < (best?.score ?? Infinity)) best = { el, score: s };
  });
  return (best as { el: HTMLElement } | null)?.el ?? null;
}

export function focusElement(el: HTMLElement, repeat = false): void {
  el.focus({ preventScroll: true });
  // Rows are centred vertically like Home's focused-row scrolling; everything else scrolls the minimum.
  const inRow = !!el.closest(".row, .grid");
  el.scrollIntoView({ block: inRow ? "center" : "nearest", inline: "nearest", behavior: repeat ? "auto" : "smooth" });
}

/** The element a keyboard user lands on when nothing is focused yet. */
function initialTarget(): HTMLElement | null {
  const auto = document.querySelector<HTMLElement>('[data-autofocus="true"]');
  if (auto && visibleRect(auto)) return auto;
  const nav = document.querySelector<HTMLElement>('.navitem[data-selected="true"]');
  if (nav) return nav;
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => visibleRect(el)) ?? null;
}

export function installSpatialNavigation(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = KEY_TO_DIRECTION[event.key];
    if (!direction || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const active = document.activeElement;
    if (isTextEntry(active) || (active instanceof HTMLInputElement && active.type === "range")) return;
    const trapEl = document.querySelector<HTMLElement>('[data-spatial-trap="true"]');
    // Screens that own the arrow keys themselves (the player: seek / volume) opt out — including when nothing is focused
    // yet — but a dialog opened inside them still gets directional navigation.
    if (!trapEl && document.querySelector('[data-spatial="off"]')) return;
    if (trapEl && !active?.closest('[data-spatial-trap="true"]')) {
      // a dialog is open: pull focus into it first
      const first = trapEl.querySelector<HTMLElement>(FOCUSABLE);
      if (first) {
        event.preventDefault();
        focusElement(first);
      }
      return;
    }
    setModality("keyboard");

    if (!active || active === document.body || active === document.documentElement) {
      const target = initialTarget();
      if (target) {
        event.preventDefault();
        focusElement(target);
        playSound("nav");
      }
      return;
    }
    const trap = active.closest<HTMLElement>('[data-spatial-trap="true"]');
    // Like the TV: DOWN from the nav bar lands on the screen's primary control (contentFocusRequester), and UP from
    // content returns to the *selected* nav item rather than whichever one happens to be nearest.
    if (direction === "down" && !trap && active.closest(".topnav")) {
      const primary = document.querySelector<HTMLElement>('[data-autofocus="true"]');
      if (primary && visibleRect(primary)) {
        event.preventDefault();
        focusElement(primary, event.repeat);
        playSound("nav");
        return;
      }
    }
    let next = findNext(direction, active, trap ?? document);
    if (next && direction === "up" && !trap && next.closest(".topnav")) next = document.querySelector<HTMLElement>('.navitem[data-selected="true"]') ?? next;
    if (next) {
      event.preventDefault();
      focusElement(next, event.repeat);
      playSound("nav");
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
