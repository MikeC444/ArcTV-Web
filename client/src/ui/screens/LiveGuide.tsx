import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronLeft, MdChevronRight, MdClose, MdPlayArrow } from "react-icons/md";
import { Link } from "react-router-dom";
import { defaultGuideSource, fetchGuide, fetchGuideSources, formatClock, formatDayName, formatRange, gridWidthPx, GUIDE_BATCH, guideWindow, layoutRow, offsetPx, programmeAt, progressOf, timeTicks, type GuideChannel, type GuideProgramme, type GuideSource } from "../../domain/epg";
import type { LiveChannel } from "../../domain/live";
import { routes } from "../../lib/routes";
import { setLiveLineup } from "../../state/liveLineup";
import { Spinner } from "../components/States";

const SOURCE_KEY = "arctv.live.guideSource";
/** How many of the listed channels the guide looks up listings for (more load as the list is scrolled, up to this). */
const MAX_GUIDE_CHANNELS = 500;
const REFRESH_MS = 15 * 60_000;
const keyOf = (c: Pick<LiveChannel, "providerId" | "type" | "id">) => `${c.providerId}|${c.type}|${c.id}`;

function savedSource(): string {
  try {
    const stored = localStorage.getItem(SOURCE_KEY);
    if (stored) return stored;
  } catch {
    /* private mode: the choice just lasts until the page is reloaded */
  }
  return defaultGuideSource(typeof navigator === "undefined" ? undefined : navigator.language) ?? "UK1";
}

interface Selected {
  channel: LiveChannel;
  programme: GuideProgramme;
}

/**
 * The TV guide: the listed channels as rows against time, with what is on now, a line for the current time, and a panel for any programme.
 * Listings come from the web server (public XMLTV for the chosen country, matched to the addon's channel names), because addons only name channels.
 * Channels the listings don't know are counted and can be shown without times.
 */
export function LiveGuide({ channels, onNeedMore }: { channels: LiveChannel[]; onNeedMore?: () => void }) {
  const [sources, setSources] = useState<GuideSource[]>([]);
  const [source, setSource] = useState(savedSource);
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<Map<string, GuideChannel>>(new Map());
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showMissing, setShowMissing] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [refresh, setRefresh] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const requested = useRef(new Set<string>());
  const generation = useRef(0);
  const scrolledToNow = useRef(false);

  // the clock behind the "now" line ticks every minute; the window only moves in half hours
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setRefresh((n) => n + 1), REFRESH_MS);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetchGuideSources().then((list) => !cancelled && setSources(list)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const guideRange = useMemo(() => guideWindow(now), [Math.floor(now / 1_800_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowS = Math.floor(now / 1000);
  const width = gridWidthPx(guideRange);
  const ticks = useMemo(() => timeTicks(guideRange), [guideRange]);

  const wanted = useMemo(() => channels.slice(0, MAX_GUIDE_CHANNELS), [channels]);
  const wantedKey = wanted.map(keyOf).join("\n");

  // a new country, a new window or a refresh starts the lookups over; more channels only add to them
  const resetKey = `${source}|${guideRange.from}|${refresh}`;
  const lastReset = useRef("");
  useEffect(() => {
    if (lastReset.current !== resetKey) {
      lastReset.current = resetKey;
      generation.current += 1;
      requested.current = new Set();
    }
    const mine = generation.current;
    const fresh = wanted.filter((c) => !requested.current.has(keyOf(c)));
    if (fresh.length === 0) return undefined;
    fresh.forEach((c) => requested.current.add(keyOf(c)));
    // These lookups are not cancelled when the effect runs again (React may run it twice, and the list may grow mid-request): the channels are
    // already marked as asked, so dropping the answer would leave them without times. Only a new country or window (the generation) makes an answer stale.
    void (async () => {
      try {
        for (let at = 0; at < fresh.length; at += GUIDE_BATCH) {
          const batch = fresh.slice(at, at + GUIDE_BATCH);
          const guide = await fetchGuide(source, batch.map((c) => ({ key: keyOf(c), name: c.name })), guideRange.from, guideRange.to);
          if (generation.current !== mine) return;
          setData((previous) => {
            const next = new Map(previous);
            for (const row of guide.channels) next.set(row.key, row);
            return next;
          });
          setMissing((previous) => {
            const next = new Set(previous);
            guide.channels.forEach((c) => next.delete(c.key));
            guide.unmatched.forEach((k) => next.add(k));
            return next;
          });
        }
        if (generation.current === mine) setStatus("ready");
      } catch {
        if (generation.current === mine) setStatus((s) => (s === "ready" ? s : "error"));
      }
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, wantedKey]);

  // a different country or window begins with a clean grid, not the old one
  useEffect(() => {
    setData(new Map());
    setMissing(new Set());
    setStatus("loading");
    setSelected(null);
    scrolledToNow.current = false;
  }, [source, guideRange.from]);

  const rows = useMemo(() => wanted.filter((c) => data.has(keyOf(c))), [wanted, data]);
  const unmatched = useMemo(() => wanted.filter((c) => missing.has(keyOf(c))), [wanted, missing]);

  // the player's next / previous channel then walks the channels shown here
  useEffect(() => {
    if (rows.length > 0) setLiveLineup(rows);
  }, [rows]);

  // first time listings arrive, bring "now" into view
  useEffect(() => {
    const el = scroller.current;
    if (!el || rows.length === 0 || scrolledToNow.current) return;
    scrolledToNow.current = true;
    el.scrollLeft = Math.max(0, offsetPx(nowS, guideRange) - 30 * 5); // half an hour before now, so what is on has its start in view
  }, [rows.length, nowS, guideRange]);

  // reaching the bottom asks the list for more channels
  useEffect(() => {
    const el = scroller.current;
    if (!el || !onNeedMore) return undefined;
    const onScroll = () => el.scrollTop + el.clientHeight > el.scrollHeight - 300 && onNeedMore();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onNeedMore, rows.length]);

  const jump = useCallback((hours: number) => scroller.current?.scrollBy({ left: hours * 60 * 5, behavior: "smooth" }), []);
  const goNow = useCallback(() => scroller.current?.scrollTo({ left: Math.max(0, offsetPx(Math.floor(Date.now() / 1000), guideRange) - 30 * 5), behavior: "smooth" }), [guideRange]);
  const chooseSource = (id: string) => {
    setSource(id);
    try {
      localStorage.setItem(SOURCE_KEY, id);
    } catch {
      /* ignore */
    }
  };
  const label = sources.find((s) => s.id === source)?.label ?? source;
  const sourceList = sources.some((s) => s.id === source) || sources.length === 0 ? sources : [{ id: source, label: source }, ...sources];

  const channelCell = (c: LiveChannel, guideChannel?: GuideChannel) => (
    <Link className="lguide__chan" to={routes.liveChannel(c.providerId, c.type, c.id)} aria-label={`Watch ${c.name}`}>
      <span className="lguide__logo">
        {c.logoUrl ?? guideChannel?.icon ? <img src={(c.logoUrl ?? guideChannel?.icon) as string} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} /> : null}
      </span>
      <span className="lguide__name">{c.name}</span>
    </Link>
  );

  return (
    <section className="lguide" aria-label="TV guide">
      <div className="lguide__bar">
        <label className="lguide__source">
          <span>Guide for</span>
          <select value={source} onChange={(e) => chooseSource(e.target.value)} aria-label="Country for the TV guide">
            {sourceList.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div className="lguide__nav" role="group" aria-label="Move through time">
          <button type="button" onClick={() => jump(-3)} aria-label="Earlier"><MdChevronLeft /></button>
          <button type="button" className="lguide__now" onClick={goNow}>Now</button>
          <button type="button" onClick={() => jump(3)} aria-label="Later"><MdChevronRight /></button>
        </div>
      </div>

      {selected ? <ProgrammePanel selected={selected} nowS={nowS} onClose={() => setSelected(null)} /> : null}

      {status === "loading" && rows.length === 0 ? (
        <div className="lguide__state" role="status"><Spinner /> <span>Loading the TV guide…</span></div>
      ) : status === "error" && rows.length === 0 ? (
        <div className="lguide__state" role="alert">
          <span>The TV guide couldn't be loaded right now.</span>
          <button type="button" className="lguide__retry" onClick={() => setRefresh((n) => n + 1)}>Try again</button>
        </div>
      ) : rows.length === 0 && !showMissing ? (
        <div className="lguide__state">
          <span>No guide times were found for these channels in {label}. Try another country above, or show the channels without times.</span>
          {unmatched.length > 0 ? <button type="button" className="lguide__retry" onClick={() => setShowMissing(true)}>Show {unmatched.length} channels</button> : null}
        </div>
      ) : (
        <div className="lguide__scroller" ref={scroller}>
          <div className="lguide__inner" style={{ width: `calc(var(--lg-left) + ${width}px)` }}>
            <div className="lguide__head">
              <div className="lguide__corner"><span>{formatDayName(nowS, now)}</span></div>
              <div className="lguide__ticks" style={{ width }}>
                {ticks.map((t, i) => {
                  const midnight = new Date(t.time * 1000).getHours() === 0 && new Date(t.time * 1000).getMinutes() === 0;
                  return (
                    <span key={t.time} className="lguide__tick" data-major={t.major} style={{ left: t.left }}>
                      {i === 0 || midnight ? <em>{formatDayName(t.time, now)}</em> : null}
                      {t.label}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="lguide__nowline" style={{ left: `calc(var(--lg-left) + ${offsetPx(nowS, guideRange)}px)` }} aria-hidden="true" />
            {rows.map((c) => {
              const g = data.get(keyOf(c))!;
              const current = programmeAt(g.programmes, nowS);
              return (
                <div className="lguide__row" role="row" key={keyOf(c)}>
                  {channelCell(c, g)}
                  <div className="lguide__track" style={{ width }} role="presentation">
                    {layoutRow(g.programmes, guideRange).map((b) => {
                      const isNow = b.programme === current;
                      return (
                        <button
                          type="button"
                          key={`${b.programme.s}-${b.programme.t}`}
                          className="lguide__prog"
                          data-now={isNow ? "true" : undefined}
                          data-past={b.programme.e <= nowS ? "true" : undefined}
                          data-selected={selected?.programme === b.programme ? "true" : undefined}
                          style={{ left: b.left, width: Math.max(2, b.width - 2) }}
                          title={`${b.programme.t} · ${formatRange(b.programme)}`}
                          onClick={() => setSelected({ channel: c, programme: b.programme })}
                        >
                          {isNow ? <span className="lguide__fill" style={{ width: `${progressOf(b.programme, nowS) * 100}%` }} /> : null}
                          <b>{b.programme.t}</b>
                          <small>{formatClock(b.programme.s)}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {showMissing
              ? unmatched.map((c) => (
                  <div className="lguide__row lguide__row--none" role="row" key={keyOf(c)}>
                    {channelCell(c)}
                    <div className="lguide__track" style={{ width }}>
                      <span className="lguide__noguide">No guide times for this channel</span>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      )}

      {unmatched.length > 0 && rows.length > 0 ? (
        <p className="lguide__foot">
          {unmatched.length} {unmatched.length === 1 ? "channel has" : "channels have"} no guide times in {label}.{" "}
          <button type="button" onClick={() => setShowMissing((v) => !v)}>{showMissing ? "Hide them" : "Show them"}</button>
        </p>
      ) : null}
      <p className="lguide__credit">Listings are public XMLTV from epgshare01.online, matched to your addon's channel names, so a few channels may not line up.</p>
    </section>
  );
}

function ProgrammePanel({ selected, nowS, onClose }: { selected: Selected; nowS: number; onClose(): void }) {
  const { channel, programme } = selected;
  const airing = programme.s <= nowS && nowS < programme.e;
  const over = programme.e <= nowS;
  return (
    <aside className="lguide__panel" aria-label="Programme details">
      <button type="button" className="lguide__close" onClick={onClose} aria-label="Close details"><MdClose /></button>
      <p className="lguide__panelchan">{channel.name} · {formatRange(programme)}{airing ? " · on now" : over ? " · finished" : ""}</p>
      <h3>{programme.t}</h3>
      {programme.st ? <p className="lguide__sub">{programme.st}</p> : null}
      {programme.c ? <span className="lguide__cat">{programme.c}</span> : null}
      {programme.d ? <p className="lguide__desc">{programme.d}</p> : null}
      <Link className="lguide__watch" to={routes.liveChannel(channel.providerId, channel.type, channel.id)}>
        <MdPlayArrow aria-hidden="true" /> {airing ? "Watch live" : over ? "Watch channel" : `Watch channel (starts ${formatClock(programme.s)})`}
      </Link>
    </aside>
  );
}
