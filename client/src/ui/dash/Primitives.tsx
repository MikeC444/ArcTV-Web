import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { donutSlices, sparkPath } from "../../lib/dash";

const reduceMotion = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTest = (): boolean => (import.meta as { env?: { MODE?: string } }).env?.MODE === "test";

/** A number that counts up to its value on first show and between refreshes (just shows it for people who prefer less motion). */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(isTest() || reduceMotion() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (isTest() || reduceMotion()) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(origin + (value - origin) * eased);
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

/** A small line (or bars) behind a tile's number. */
export function Spark({ values, bars }: { values: number[]; bars?: boolean }) {
  const id = useId();
  if (values.length < 2) return null;
  if (bars) {
    const max = Math.max(...values, 1);
    const w = 300 / values.length;
    return (
      <svg className="dd-spark" viewBox="0 0 300 62" preserveAspectRatio="none" aria-hidden="true">
        {values.map((v, i) => (
          <rect key={i} x={i * w + w * 0.15} y={62 - Math.max(3, (v / max) * 58)} width={w * 0.7} height={Math.max(3, (v / max) * 58)} rx="4" fill="#19e6ff" opacity={0.35 + 0.65 * (i / (values.length - 1))} />
        ))}
      </svg>
    );
  }
  const line = sparkPath(values, 300, 54);
  return (
    <svg className="dd-spark" viewBox="0 0 300 62" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" x2="1"><stop stopColor="#19e6ff" /><stop offset="1" stopColor="#9b5cff" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2f80ff" stopOpacity=".35" /><stop offset="1" stopColor="#2f80ff" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={`${line} L300 62 L0 62 Z`} fill={`url(#${id}f)`} transform="translate(0 4)" />
      <path d={line} fill="none" stroke={`url(#${id}s)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 4)" />
    </svg>
  );
}

/** A ring split by [entries], with [children] in the middle. */
export function Donut({ entries, children }: { entries: Array<{ key: string; value: number; color: string }>; children?: ReactNode }) {
  const slices = donutSlices(entries);
  const r = 62;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 0.012 : 0;
  return (
    <div className="dd-donut">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="16" />
        {slices.map((s) => (
          <circle key={s.key} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${Math.max(0, (s.to - s.from - gap) * c)} ${c}`} strokeDashoffset={-s.from * c} transform="rotate(-90 80 80)" strokeLinecap="butt" />
        ))}
      </svg>
      <div className="dd-donut__mid">{children}</div>
    </div>
  );
}

/** A card with a small heading; [onOpen] makes the whole card a button to the view with the full picture. */
export function Card({ title, aside, className, onOpen, children }: { title?: ReactNode; aside?: ReactNode; className?: string; onOpen?: () => void; children: ReactNode }) {
  return (
    <section className={`dd-card${className ? ` ${className}` : ""}`} data-open={onOpen ? "true" : undefined}>
      {title || aside ? (
        <header className="dd-card__head">
          <h2 className="dd-lbl">{title}</h2>
          {aside}
        </header>
      ) : null}
      {children}
      {onOpen ? <button type="button" className="dd-card__open" onClick={onOpen} aria-label={`Open ${typeof title === "string" ? title : "details"}`} /> : null}
    </section>
  );
}

/** One headline number. */
export function Stat({ label, value, note, tone, children }: { label: string; value: number | string; note?: ReactNode; tone?: "warn" | "live"; children?: ReactNode }) {
  return (
    <div className="dd-stat" data-tone={tone}>
      <div className="dd-lbl">{label}</div>
      <div className="dd-big">{typeof value === "number" ? <CountUp value={value} /> : value}</div>
      {note ? <div className="dd-sub">{note}</div> : null}
      {children}
    </div>
  );
}

/** The shared horizontal bar used for shares of a whole. */
export function Bar({ percent, color }: { percent: number; color?: string }) {
  return (
    <span className="dd-bar" aria-hidden="true">
      <i style={{ width: `${Math.max(percent > 0 ? 3 : 0, Math.min(100, percent))}%`, ...(color ? { background: color } : {}) }} />
    </span>
  );
}

export function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="dd-flat">no change{suffix}</span>;
  return <span className={value > 0 ? "dd-up" : "dd-down"}>{value > 0 ? "▲" : "▼"} {Math.abs(value).toLocaleString()}{suffix}</span>;
}
