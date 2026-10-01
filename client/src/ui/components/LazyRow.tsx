import { useEffect, useRef, useState } from "react";
import type { HomeSection } from "../../domain/types";
import { ContentRow } from "./ContentRow";

/**
 * Home has ~30 rows; building every poster of every row at once froze the page (and the bottom tab bar) for seconds on a phone.
 * Rows below the first few are only built once they scroll to within a screen or two of view, and stay built after that.
 */
export function LazyRow({ section, eager }: { section: HomeSection; eager: boolean }) {
  const [near, setNear] = useState(eager);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (near) return undefined;
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "900px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  if (near) return <ContentRow section={section} />;
  return <div ref={holder} className="row row--pending" aria-label={section.title} role="region" />;
}
