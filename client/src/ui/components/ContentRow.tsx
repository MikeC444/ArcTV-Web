import { useEffect, useState } from "react";
import type { HomeSection } from "../../domain/types";
import { ContentCard } from "./ContentCard";
import { ScrollRow } from "./ScrollRow";

/** A row builds this many posters at first and more as you scroll toward its end (a full catalogue row is ~100; building them all, in ~30 rows, froze phones). */
const ROW_PAGE = 30;

interface ContentRowProps {
  section: HomeSection;
  compact?: boolean;
  headingLevel?: 2 | 3;
}

/** ui/components/ContentRow.kt — titled horizontal row (poster size comes from --poster-cols); on desktop, hover arrows page it for mouse users. */
export function ContentRow({ section, compact, headingLevel = 2 }: ContentRowProps) {
  const [visible, setVisible] = useState(ROW_PAGE);
  const total = section.items.length;

  useEffect(() => setVisible(ROW_PAGE), [section.id]);

  // within two screens of the end: build the next batch of posters
  const nearEnd = (el: HTMLDivElement) => {
    if (el.scrollLeft + el.clientWidth * 3 > el.scrollWidth) setVisible((v) => (v < total ? Math.min(total, v + ROW_PAGE) : v));
  };
  const Heading = `h${headingLevel}` as "h2" | "h3";

  return (
    <section className="row" data-compact={compact || undefined} aria-label={section.title}>
      <Heading className="row__title" style={{ margin: 0 }}>
        {section.title}
      </Heading>
      <ScrollRow label={section.title} className="row__scroller row__scroller--posters hide-scroll" contentKey={`${section.id}:${total}:${visible}`} centerOn=".card__surface" onMeasure={nearEnd} role="list">
        {section.items.slice(0, visible).map((content) => (
          <div role="listitem" key={content.id} style={{ display: "contents" }}>
            <ContentCard content={content} style={section.style} />
          </div>
        ))}
      </ScrollRow>
    </section>
  );
}
