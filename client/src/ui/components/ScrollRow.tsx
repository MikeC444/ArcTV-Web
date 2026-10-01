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
  role?: string;
  ariaLabel?: string;
  tabIndex?: number;
  children: ReactNode;
}

/** A sideways-scrolling strip with the same hover arrows the Home rows have, so a mouse (which only scrolls up and down) can reach the rest. */
export function ScrollRow({ label, className, style, contentKey, role, ariaLabel, tabIndex, children }: ScrollRowProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
    measure();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, contentKey]);

  const page = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div className="row scrollrow">
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
