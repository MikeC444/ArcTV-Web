import type { ReactNode } from "react";
import { MdChevronRight } from "react-icons/md";
import { Surface, type SurfaceProps } from "./Surface";

export type MangoButtonStyle = "filled" | "glass" | "light" | "white";

interface MangoButtonProps extends Omit<SurfaceProps, "children" | "radius" | "background" | "backgroundImage"> {
  text: string;
  icon: ReactNode;
  variant?: MangoButtonStyle;
  compact?: boolean;
  /** Full-width list-item style with a trailing chevron (auth start screen). */
  trailingChevron?: boolean;
  fullWidth?: boolean;
  /** Optional accessible name override; defaults to `text`. */
  loading?: boolean;
}

/** MangoButton.kt — FILLED (brand gradient), GLASS (white 12 %), LIGHT (white pill), plus a plain white variant (Search). */
export function MangoButton({ text, icon, variant = "glass", compact, trailingChevron, fullWidth, className, ...rest }: MangoButtonProps) {
  return (
    <Surface
      {...rest}
      className={`mbtn${className ? ` ${className}` : ""}`}
      dataAttrs={{ variant, compact: compact || undefined, full: fullWidth || undefined, trailing: trailingChevron || undefined, ...rest.dataAttrs }}
    >
      <span className="mbtn__inner">
        <span className="mbtn__lead">
          {icon}
          <span className="mbtn__label">{text}</span>
        </span>
        {trailingChevron ? <MdChevronRight /> : null}
      </span>
    </Surface>
  );
}

interface IconButtonProps extends Omit<SurfaceProps, "children" | "radius"> {
  icon: ReactNode;
  label: string;
  compact?: boolean;
  showBackground?: boolean;
}

/** HeroIconButton.kt — round translucent button (Add to list, More info, player controls). */
export function IconButton({ icon, label, compact, showBackground = true, className, ...rest }: IconButtonProps) {
  return (
    <Surface {...rest} ariaLabel={label} title={label} className={`ibtn${className ? ` ${className}` : ""}`} dataAttrs={{ compact: compact || undefined, bg: showBackground ? undefined : "false", ...rest.dataAttrs }}>
      {icon}
    </Surface>
  );
}

/** FilterPill.kt */
export function Pill({ label, selected, onClick, large, icon, ...rest }: Omit<SurfaceProps, "children" | "radius"> & { label: string; selected?: boolean; large?: boolean; icon?: ReactNode }) {
  return (
    <Surface {...rest} onClick={onClick} className={`pill${large ? " pill--lg" : ""}`} ariaPressed={selected} dataAttrs={{ selected: selected ? "true" : "false" }}>
      {label}
      {icon}
    </Surface>
  );
}

export function Switch({ checked, white }: { checked: boolean; white?: boolean }) {
  return (
    <span className={`switch${white ? " switch--white" : ""}`} data-checked={checked} aria-hidden="true">
      <span />
    </span>
  );
}
