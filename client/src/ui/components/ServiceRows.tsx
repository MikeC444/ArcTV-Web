import { useEffect, useRef } from "react";
import type { Content } from "../../domain/types";
import { ContentCard } from "./ContentCard";
import { NetflixN } from "./TopTenRow";

/** The titles under a streaming service's Top 10: rows of posters close together (small gaps and corners, no captions, the service's N on each), with no headings. More titles load as the page is scrolled to its end. */
export function ServiceRows({ items, onLoadMore }: { items: Content[]; onLoadMore?: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onLoadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, items.length]);
  return (
    <div className="nfrows">
      <div className="grid" role="list">
        {items.map((content) => (
          <div role="listitem" key={content.id} style={{ display: "contents" }}>
            <ContentCard content={content} badge={<NetflixN />} />
          </div>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
      <div style={{ height: "calc(48 * var(--dp))" }} />
    </div>
  );
}
