import { forwardRef, useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { playSound } from "../../lib/sounds";

export type ClickSound = "default" | "back" | "none";

export interface SurfaceProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Renders a router <Link> (real navigation semantics: middle-click, open in new tab, right-click → copy link). */
  to?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Long-press (touch / Enter held 0.5 s) or right-click / Menu key — the Firestick's "hold OK" quick-actions menu. */
  onLongPress?: () => void;
  clickSound?: ClickSound;
  disabled?: boolean;
  /** CSS corner radius (defaults to the app's card radius). */
  radius?: string;
  background?: string;
  backgroundImage?: string;
  borderColor?: string;
  /** Focus/hover scale, default 1.08 (the Fire TV app's focus scale). */
  scale?: number;
  alwaysBorder?: boolean;
  instantBorder?: boolean;
  noShadow?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;
  /** For role="switch" / role="radio" (aria-pressed is only valid on buttons). */
  ariaChecked?: boolean;
  ariaCurrent?: "page" | undefined;
  role?: string;
  title?: string;
  tabIndex?: number;
  id?: string;
  autoFocus?: boolean;
  type?: "button" | "submit";
  onFocus?: () => void;
  onBlur?: () => void;
  dataAttrs?: Record<string, string | boolean | number | undefined>;
}

const LONG_PRESS_MS = 500;

/**
 * The single building block behind every focusable tile — TvFocusSurface.kt for the web. Focus (keyboard/D-pad-style)
 * and pointer hover both trigger the same scale + glow + ring; click plays the UI click sound.
 */
export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(props, ref) {
  const { children, className, style, to, onClick, onLongPress, clickSound = "default", disabled, radius, background, backgroundImage, borderColor, scale, alwaysBorder, instantBorder, noShadow, ariaLabel, ariaPressed, ariaChecked, ariaCurrent, role, title, tabIndex, id, autoFocus, onFocus, onBlur, dataAttrs, type = "button" } = props;
  const timer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const css = {
    ...(radius ? { "--tvs-radius": radius } : {}),
    ...(background ? { "--tvs-bg": background } : {}),
    ...(backgroundImage ? { "--tvs-bg-image": backgroundImage } : {}),
    ...(borderColor ? { "--tvs-border": borderColor } : {}),
    ...(scale ? { "--tvs-scale": String(scale) } : {}),
    ...style,
  } as CSSProperties;

  const fire = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      return;
    }
    if (clickSound === "default") playSound("click");
    else if (clickSound === "back") playSound("back");
    onClick?.(event);
  };

  const longPressProps = onLongPress
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
          if (event.pointerType === "mouse") return; // mouse users have right-click
          start.current = { x: event.clientX, y: event.clientY };
          clearTimer();
          timer.current = window.setTimeout(() => {
            suppressClick.current = true;
            onLongPress();
          }, LONG_PRESS_MS);
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clearTimer();
        },
        onPointerUp: clearTimer,
        onPointerCancel: clearTimer,
        onContextMenu: (event: MouseEvent<HTMLElement>) => {
          event.preventDefault();
          clearTimer();
          suppressClick.current = false;
          onLongPress();
        },
        // Holding OK/Enter opens the menu; a quick press still clicks (Enter is handled on key-up so the two can be told apart).
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== "Enter" || event.repeat) return;
          event.preventDefault();
          clearTimer();
          timer.current = window.setTimeout(() => {
            suppressClick.current = true;
            timer.current = null;
            onLongPress();
          }, LONG_PRESS_MS);
        },
        onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== "Enter") return;
          const wasPending = timer.current !== null;
          clearTimer();
          if (wasPending && !suppressClick.current) (event.currentTarget as HTMLElement).click();
          suppressClick.current = false;
        },
      }
    : {};

  const common = {
    className: `tvs${className ? ` ${className}` : ""}`,
    style: css,
    "aria-label": ariaLabel,
    "aria-pressed": ariaPressed,
    "aria-checked": ariaChecked,
    "aria-current": ariaCurrent,
    role,
    title,
    id,
    tabIndex,
    autoFocus,
    onFocus,
    onBlur,
    "data-always-border": alwaysBorder ? "true" : undefined,
    "data-instant-border": instantBorder ? "true" : undefined,
    "data-no-shadow": noShadow ? "true" : undefined,
    ...Object.fromEntries(Object.entries(dataAttrs ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [`data-${k}`, String(v)])),
    ...longPressProps,
  };

  if (to && !disabled) {
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} to={to} onClick={fire} {...common}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} type={type} disabled={disabled} onClick={fire} {...common}>
      {children}
    </button>
  );
});
