import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MdShowChart, MdTableChart } from "react-icons/md";
import { addedIn, compactNumber, formatDay, GROWTH_RANGES, labelIndices, niceTicks, rangePoints, type GrowthPoint, type GrowthRange } from "../../lib/growth";

const HEIGHT = 260;
const MARGIN = { top: 14, right: 64, bottom: 30, left: 44 };
/** The readout box is about this tall; it sits below the hovered point when there is room, else above it, so it never covers the point. */
const TIP_HEIGHT = 96;

/**
 * How many accounts exist over time: one line over a faint area, a crosshair with a readout for any day (pointer or the arrow keys), range
 * buttons above it and a table view of the same numbers. It draws whatever it is given, so the panel's 30-second refresh keeps it live.
 */
export function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const [range, setRange] = useState<GrowthRange>(30);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.max(280, Math.round(el.clientWidth)) || 640);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, Math.round(el.clientWidth)) || 640));
    observer.observe(el);
    return () => observer.disconnect();
  }, [table]);

  const shown = useMemo(() => rangePoints(points, range), [points, range]);
  const last = shown[shown.length - 1];
  const added = addedIn(shown);
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const ticks = useMemo(() => niceTicks(Math.max(...shown.map((p) => p.total), 1)), [shown]);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const x = (i: number) => MARGIN.left + (shown.length > 1 ? (i * innerW) / (shown.length - 1) : innerW / 2);
  const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH;
  const line = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  const area = shown.length > 1 ? `${line} L${x(shown.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : "";

  const nearest = (event: PointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    return Math.min(shown.length - 1, Math.max(0, Math.round(((px - MARGIN.left) / Math.max(innerW, 1)) * (shown.length - 1))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const at = hover ?? shown.length - 1;
    setHover(event.key === "Home" ? 0 : event.key === "End" ? shown.length - 1 : Math.min(shown.length - 1, Math.max(0, at + (event.key === "ArrowRight" ? 1 : -1))));
  };

  const active = hover != null ? shown[hover] : undefined;
  const tipLeft = hover != null ? Math.min(Math.max(x(hover), 90), width - 90) : 0;
  const tipBelow = active != null && y(active.total) + 14 + TIP_HEIGHT <= HEIGHT - MARGIN.bottom + 6;
  const tipTop = active == null ? 0 : tipBelow ? y(active.total) + 14 : Math.max(0, y(active.total) - 14 - TIP_HEIGHT);

  return (
    <section className="admin__growth page__pad" aria-label="User growth">
      <div className="admin__growthhead">
        <div>
          <h2 className="t-title-md" style={{ margin: 0 }}>
            User growth <span className="admin__livepill"><i aria-hidden="true" />Live</span>
          </h2>
          <p className="t-label-md c-text-3" style={{ margin: "4px 0 0" }}>Accounts over time · refreshes with the panel</p>
        </div>
        <div className="admin__growthcontrols">
          <div className="admin__range" role="group" aria-label="Time range">
            {GROWTH_RANGES.map((r) => (
              <button key={String(r.id)} type="button" aria-pressed={range === r.id} onClick={() => { setRange(r.id); setHover(null); }}>{r.label}</button>
            ))}
          </div>
          <button type="button" className="admin__viewtoggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? <MdShowChart aria-hidden="true" /> : <MdTableChart aria-hidden="true" />}
            {table ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>

      {last ? (
        <div className="admin__growthfigures">
          <span className="admin__growthvalue">{last.total.toLocaleString()}</span>
          <span className="t-label-md c-text-2">users now · {added > 0 ? `+${added.toLocaleString()}` : "no new"} in {range === "all" ? "total" : `the last ${range} days`}</span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="t-label-md c-text-3">No sign-ups yet.</p>
      ) : table ? (
        <div className="admin__growthtable" role="table" aria-label="Users per day">
          <div className="admin__growthrow admin__growthrow--head t-label-md c-text-3" role="row"><span>Day</span><span>New</span><span>Total</span></div>
          {[...shown].reverse().map((p) => (
            <div className="admin__growthrow" role="row" key={p.date}><span>{formatDay(p.date)}</span><span>{p.newUsers > 0 ? `+${p.newUsers}` : "0"}</span><span>{p.total.toLocaleString()}</span></div>
          ))}
        </div>
      ) : (
        <div className="admin__growthplot" ref={box}>
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={`Users over the last ${shown.length} days: from ${shown[0]!.total} to ${last!.total}. Use the left and right arrow keys to read each day.`}
            tabIndex={0}
            onPointerMove={(e) => setHover(nearest(e))}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="admin__gridline" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
                <text className="admin__axis" x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{compactNumber(t)}</text>
              </g>
            ))}
            {labelIndices(shown.length).map((i, k, all) => (
              <text className="admin__axis" key={i} x={x(i)} y={HEIGHT - 8} textAnchor={k === 0 && all.length > 1 ? "start" : k === all.length - 1 && all.length > 1 ? "end" : "middle"}>
                {formatDay(shown[i]!.date)}
              </text>
            ))}
            {area ? <path className="admin__area" d={area} /> : null}
            <path className="admin__line" d={line} />
            {hover != null && active ? (
              <>
                <line className="admin__crosshair" x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={y(0)} />
                <circle className="admin__dot" cx={x(hover)} cy={y(active.total)} r={4} />
              </>
            ) : (
              <>
                <circle className="admin__dot" cx={x(shown.length - 1)} cy={y(last!.total)} r={4} />
                <text className="admin__endlabel" x={x(shown.length - 1) + 10} y={y(last!.total)} dominantBaseline="middle">{last!.total.toLocaleString()}</text>
              </>
            )}
          </svg>
          {active ? (
            <div className="admin__tip" style={{ left: tipLeft, top: tipTop }} role="status">
              <b>{active.total.toLocaleString()}</b>
              <span>{active.newUsers > 0 ? `+${active.newUsers.toLocaleString()} new` : "no new users"}</span>
              <span className="c-text-3">{formatDay(active.date)}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
