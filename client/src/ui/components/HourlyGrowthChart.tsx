import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { busiestHour, compactNumber, formatDay, formatHour, formatHourOfDay, HOURLY_RANGES, hourlyRangePoints, labelIndices, niceTicks, type HourlyPoint, type HourlyRange } from "../../lib/growth";

const HEIGHT = 260;
const MARGIN = { top: 14, right: 16, bottom: 30, left: 44 };
/** The readout box is about this tall; it sits below the hovered bar when there is room, else above it. */
const TIP_HEIGHT = 96;

/**
 * How fast accounts are being created: one bar per hour (UTC) for the last day, two or three, with a readout for any hour (pointer or the arrow
 * keys) and range buttons above it. It draws whatever it is given, so the panel's refresh keeps it live.
 */
export function HourlyGrowthChart({ points }: { points: HourlyPoint[] }) {
  const [range, setRange] = useState<HourlyRange>(24);
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
  }, []);

  const shown = useMemo(() => hourlyRangePoints(points, range), [points, range]);
  const last = shown[shown.length - 1];
  const added = shown.reduce((sum, p) => sum + p.newUsers, 0);
  const busiest = busiestHour(shown);
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const ticks = useMemo(() => niceTicks(Math.max(...shown.map((p) => p.newUsers), 1)), [shown]);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const slot = innerW / Math.max(shown.length, 1);
  const barW = Math.max(2, slot * 0.7);
  const cx = (i: number) => MARGIN.left + slot * i + slot / 2;
  const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH;

  const nearest = (event: PointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    return Math.min(shown.length - 1, Math.max(0, Math.floor((px - MARGIN.left) / Math.max(slot, 1))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const at = hover ?? shown.length - 1;
    setHover(event.key === "Home" ? 0 : event.key === "End" ? shown.length - 1 : Math.min(shown.length - 1, Math.max(0, at + (event.key === "ArrowRight" ? 1 : -1))));
  };

  const active = hover != null ? shown[hover] : undefined;
  const tipLeft = hover != null ? Math.min(Math.max(cx(hover), 90), width - 90) : 0;
  const tipBelow = active != null && y(active.newUsers) + 14 + TIP_HEIGHT <= HEIGHT - MARGIN.bottom + 6;
  const tipTop = active == null ? 0 : tipBelow ? y(active.newUsers) + 14 : Math.max(0, y(active.newUsers) - 14 - TIP_HEIGHT);
  // axis labels: the hour, and the day too at midnight and at the first label
  const axisLabel = (i: number): string => {
    const hour = shown[i]!.hour;
    return i === 0 || hour.slice(11, 13) === "00" ? `${formatDay(hour.slice(0, 10))} ${formatHourOfDay(hour)}` : formatHourOfDay(hour);
  };

  return (
    <section className="admin__growth admin__growth--hourly" aria-label="Hourly sign-ups">
      <div className="admin__growthcontrols">
        <div className="admin__range" role="group" aria-label="Hours shown">
          {HOURLY_RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => { setRange(r.id); setHover(null); }}>{r.label}</button>
          ))}
        </div>
      </div>

      {last ? (
        <div className="admin__growthfigures">
          <span className="admin__growthvalue">{added.toLocaleString()}</span>
          <span className="t-label-md c-text-2">
            new in the last {range} hours{busiest ? ` · busiest hour ${formatHourOfDay(busiest.hour)} UTC (+${busiest.newUsers.toLocaleString()})` : ""} · {last.total.toLocaleString()} users now
          </span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="t-label-md c-text-3">No hourly numbers yet.</p>
      ) : (
        <div className="admin__growthplot" ref={box}>
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={`Sign-ups per hour over the last ${shown.length} hours: ${added} in all. Use the left and right arrow keys to read each hour.`}
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
            {labelIndices(shown.length, width < 480 ? 3 : 6).map((i, k, all) => (
              <text className="admin__axis" key={i} x={cx(i)} y={HEIGHT - 8} textAnchor={k === 0 && all.length > 1 ? "start" : k === all.length - 1 && all.length > 1 ? "end" : "middle"}>
                {axisLabel(i)}
              </text>
            ))}
            {shown.map((p, i) => {
              const top = y(p.newUsers);
              return (
                <rect
                  key={p.hour}
                  className={`admin__bar${hover === i ? " admin__bar--on" : ""}`}
                  x={cx(i) - barW / 2}
                  y={p.newUsers > 0 ? top : y(0) - 1}
                  width={barW}
                  height={p.newUsers > 0 ? y(0) - top : 1}
                  rx={Math.min(3, barW / 2)}
                />
              );
            })}
          </svg>
          {active ? (
            <div className="admin__tip" style={{ left: tipLeft, top: tipTop }} role="status">
              <b>{active.newUsers > 0 ? `+${active.newUsers.toLocaleString()} new` : "no new users"}</b>
              <span>{active.total.toLocaleString()} users by the end of it</span>
              <span className="c-text-3">{formatHour(active.hour)} UTC</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
