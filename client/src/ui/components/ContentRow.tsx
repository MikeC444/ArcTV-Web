import { useCallback, useEffect, useRef, useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import type { HomeSection } from "../../domain/types";
import { ContentCard } from "./ContentCard";

interface ContentRowProps {
  section: HomeSection;
  compact?: boolean;
  headingLevel?: 2 | 3;
}

/** ui/components/ContentRow.kt — titled horizontal row (poster size comes from --poster-cols); on desktop, hover arrows page it for mouse users. */
export function ContentRow({ section, compact, headingLevel = 2 }: ContentRowProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, section.items.length]);

  const page = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.85, behavior: "smooth" });
  const Heading = `h${headingLevel}` as "h2" | "h3";

  return (
    <section className="row" data-compact={compact || undefined} aria-label={section.title}>
      <Heading className="row__title" style={{ margin: 0 }}>
        {section.title}
      </Heading>
      <button type="button" className="row__nav" data-side="left" data-visible={edges.left} aria-label={`Scroll ${section.title} left`} tabIndex={-1} onClick={() => page(-1)}>
        <MdChevronLeft />
      </button>
      <div ref={scroller} className="row__scroller row__scroller--posters hide-scroll" onScroll={measure} role="list">
        {section.items.map((content) => (
          <div role="listitem" key={content.id} style={{ display: "contents" }}>
            <ContentCard content={content} style={section.style} />
          </div>
        ))}
      </div>
      <button type="button" className="row__nav" data-side="right" data-visible={edges.right} aria-label={`Scroll ${section.title} right`} tabIndex={-1} onClick={() => page(1)}>
        <MdChevronRight />
      </button>
    </section>
  );
}
