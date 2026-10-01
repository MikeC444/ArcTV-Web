import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";

interface ScrollRowProps {
  /** Names the arrows for assistive tech ("Scroll Season 1 left"). */
  label: string;
  /** Classes for the scrolling strip itself (the arrows are added around it). */
  className: string;
  style?: CSSProperties;
  /** Changes whenever the strip's contents change (another season, say), so the arrows re-check whether there is more to scroll to. */
  contentKey: string | number;
  /** When this changes (a different season), the strip goes back to its start. Left out, the scroll position is never touched. */
  resetKey?: string | number;
  role?: string;
  ariaLabel?: string;
  tabIndex?: number;
  /** A CSS selector for the pictures in the strip: the arrows are centred on the first one, not on the whole strip (which also holds captions). */
  centerOn?: string;
  /** Called whenever the strip is measured (after a scroll or a resize) — a row that builds its items gradually uses it to ask for more. */
  onMeasure?: (strip: HTMLDivElement) => void;
  children: ReactNode;
}

/** A sideways-scrolling strip with the same hover arrows the Home rows have, so a mouse (which only scrolls up and down) can reach the rest. */
export function ScrollRow({ label, className, style, contentKey, resetKey, role, ariaLabel, tabIndex, centerOn, onMeasure, children }: ScrollRowProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    onMeasureRef.current?.(el);
    const picture = centerOn ? el.querySelector(centerOn) : null;
    if (wrap.current && picture) {
      const outer = wrap.current.getBoundingClientRect();
      const box = picture.getBoundingClientRect();
      wrap.current.style.setProperty("--nav-center", `${Math.round(box.top - outer.top + box.height / 2)}px`);
    }
  }, [centerOn]);
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, contentKey]);

  useEffect(() => {
    if (resetKey !== undefined) scroller.current?.scrollTo({ left: 0 });
  }, [resetKey]);

  const page = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div ref={wrap} className="row scrollrow">
      <button type="button" className="row__nav" data-side="left" data-visible={edges.left} aria-label={`Scroll ${label} left`} tabIndex={-1} onClick={() => page(-1)}>
        <MdChevronLeft />
      </button>
      <div ref={scroller} className={className} style={style} onScroll={measure} role={role} aria-label={ariaLabel} tabIndex={tabIndex}>
        {children}
      </div>
      <button type="button" className="row__nav" data-side="right" data-visible={edges.right} aria-label={`Scroll ${label} right`} tabIndex={-1} onClick={() => page(1)}>
        <MdChevronRight />
      </button>
    </div>
  );
}
