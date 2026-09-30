import { BackButton } from "./BackButton";

/** LoadingSkeleton.kt */
export const Shimmer = ({ width, height, radius, style }: { width?: string; height?: string; radius?: string; style?: React.CSSProperties }) => (
  <div className="shimmer" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />
);

const dp = (n: number) => `calc(${n} * var(--dp))`;

const POSTER_SLOT = "calc((100% - (var(--poster-cols) - 1) * var(--poster-gap)) / var(--poster-cols))";

function SkeletonRow({ cards = 10 }: { cards?: number }) {
  return (
    <div style={{ marginBottom: dp(32) }}>
      <div style={{ padding: `0 var(--pad-x)` }}>
        <Shimmer width={dp(180)} height={dp(20)} />
      </div>
      <div style={{ display: "flex", gap: "var(--poster-gap)", padding: `${dp(14)} var(--pad-x) 0`, overflow: "hidden" }}>
        {Array.from({ length: cards }, (_, i) => (
          <Shimmer key={i} width={POSTER_SLOT} style={{ flex: "none", aspectRatio: "2 / 3" }} />
        ))}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Shimmer height="min(520px, 62vh)" radius="0" />
      <div style={{ height: dp(32) }} />
      {[0, 1, 2].map((i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ paddingTop: `calc(var(--nav-h) + ${dp(24)})` }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function GridSkeleton({ title, back }: { title: string; back?: string }) {
  return (
    <div style={{ paddingTop: `calc(var(--nav-h) + ${dp(24)})` }} aria-busy="true" aria-label="Loading">
      {back ? <div className="page__back"><BackButton fallback={back} /></div> : null}
      <h1 className="t-display-md" style={{ padding: `${dp(4)} var(--pad-x)`, margin: 0 }}>
        {title}
      </h1>
      <div style={{ display: "flex", gap: dp(8), padding: `${dp(8)} var(--pad-x)` }}>
        {[78, 118, 76].map((w) => (
          <Shimmer key={w} width={dp(w)} height={dp(30)} radius="999px" />
        ))}
      </div>
      <div className="grid" style={{ marginTop: dp(8) }}>
        {Array.from({ length: 14 }, (_, i) => (
          <Shimmer key={i} style={{ aspectRatio: "2 / 3", width: "100%" }} />
        ))}
      </div>
    </div>
  );
}
