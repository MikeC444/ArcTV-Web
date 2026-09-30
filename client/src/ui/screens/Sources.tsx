import { useEffect, useMemo, useState } from "react";
import { MdArrowBack, MdExpandMore, MdExtension, MdInfo, MdPerson, MdSearchOff, MdSecurity, MdStar, MdSurroundSound, MdCheckCircle, MdOutlineCheckCircle, MdWifi, MdPlayArrow, MdWarningAmber } from "react-icons/md";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { assessStream } from "../../domain/playability";
import { resolutionOrdinal, SOURCE_HEALTH_LABEL, type Content, type ContentType, type ResolutionTier, type Stream } from "../../domain/types";
import { formatRuntime } from "../../lib/format";
import { parseOptionalInt, routes } from "../../lib/routes";
import { useSources } from "../../state/sourcesData";
import { IconButton, MangoButton, Pill } from "../components/Buttons";
import { Shimmer } from "../components/Skeletons";
import { FullScreenError, Spinner } from "../components/States";
import { Surface } from "../components/Surface";

type SourceFilter = "ALL" | ResolutionTier;
const FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: "ALL", label: "All Sources" },
  { id: "UHD_4K", label: "4K" },
  { id: "FHD_1080P", label: "1080p" },
  { id: "HD_720P", label: "720p" },
  { id: "OTHER", label: "Other" },
];
type SourceSort = "QUALITY" | "SEEDERS" | "SIZE";
const SORTS: Array<{ id: SourceSort; label: string }> = [
  { id: "QUALITY", label: "Quality" },
  { id: "SEEDERS", label: "Seeders" },
  { id: "SIZE", label: "Size" },
];

export function sortStreams(streams: Stream[], sort: SourceSort): Stream[] {
  const copy = streams.slice();
  if (sort === "QUALITY") return copy.sort((a, b) => resolutionOrdinal(a.resolutionTier) - resolutionOrdinal(b.resolutionTier) || (b.seeders ?? -1) - (a.seeders ?? -1));
  if (sort === "SEEDERS") return copy.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
  return copy.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1));
}

export function SourcesScreen() {
  const params = useParams<{ providerId: string; type: string; id: string; season: string; episode: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const providerId = params.providerId ?? "";
  const id = params.id ?? "";
  const type: ContentType = params.type === "TV_SHOW" ? "TV_SHOW" : "MOVIE";
  const season = parseOptionalInt(params.season);
  const episode = parseOptionalInt(params.episode);
  const { state, reload } = useSources(providerId, type, id, season, episode, search.get("skip") === "1");
  const goPlay = (streamId: string, replace = false) => navigate(routes.player(providerId, type, id, season, episode, streamId), { replace });

  // "Resume" with a remembered source skips the list entirely.
  const autoSelect = state.kind === "loaded" ? state.autoSelect : null;
  useEffect(() => {
    if (autoSelect) navigate(routes.player(providerId, type, id, season, episode, autoSelect.id), { replace: true });
  }, [autoSelect, navigate, providerId, type, id, season, episode]);

  // Autoplay-next-episode lands here with ?auto=1 once the list is complete: take the best source a browser can play.
  const auto = search.get("auto") === "1";
  useEffect(() => {
    if (!auto || state.kind !== "loaded" || state.searchingMore || !state.recommendedId) return;
    const pick = state.streams.find((s) => s.id === state.recommendedId);
    if (pick && assessStream(pick).level !== "no") navigate(routes.player(providerId, type, id, season, episode, pick.id), { replace: true });
  }, [auto, state, navigate, providerId, type, id, season, episode]);

  useEffect(() => {
    document.title = state.kind === "loaded" ? `Select a Source · ${state.content.title}` : "Select a Source · Mango TV";
  }, [state]);

  if (state.kind === "error") return <FullScreenError message={state.message} onRetry={reload} />;
  if (state.kind === "loading" || autoSelect) return <SourcesShell loading onBack={() => navigate(-1)} />;
  return <SourcesLoaded state={state} onBack={() => navigate(-1)} onSelect={(s) => goPlay(s.id)} onManage={() => navigate(routes.settings("addons"))} />;
}

function SourcesShell({ onBack }: { loading?: boolean; onBack: () => void }) {
  return (
    <div className="sources" aria-busy="true">
      <aside className="sources__info">
        <IconButton icon={<MdArrowBack />} label="Back" clickSound="back" onClick={onBack} />
        <Shimmer width="calc(84 * var(--dp))" height="calc(126 * var(--dp))" style={{ marginTop: "calc(16 * var(--dp))" }} />
        <Shimmer width="calc(200 * var(--dp))" height="calc(26 * var(--dp))" style={{ marginTop: "calc(24 * var(--dp))" }} />
        <Shimmer width="calc(160 * var(--dp))" height="calc(16 * var(--dp))" style={{ marginTop: "calc(10 * var(--dp))" }} />
      </aside>
      <div className="sources__main">
        <h1 className="t-headline-sm" style={{ margin: 0 }}>Select a Source</h1>
        <p className="t-label-lg c-text-2" style={{ margin: "calc(4 * var(--dp)) 0 calc(16 * var(--dp))" }}>Choose the best quality and server for your stream.</p>
        <Shimmer width="calc(260 * var(--dp))" height="calc(36 * var(--dp))" />
        <div style={{ display: "flex", flexDirection: "column", gap: "calc(10 * var(--dp))", marginTop: "calc(14 * var(--dp))" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Shimmer key={i} height="calc(76 * var(--dp))" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SourcesLoaded({ state, onBack, onSelect, onManage }: { state: Extract<ReturnType<typeof useSources>["state"], { kind: "loaded" }>; onBack: () => void; onSelect: (s: Stream) => void; onManage: () => void }) {
  const [filter, setFilter] = useState<SourceFilter>("ALL");
  const [sort, setSort] = useState<SourceSort>("QUALITY");
  const [showHelp, setShowHelp] = useState(false);
  const filtered = useMemo(() => (filter === "ALL" ? state.streams : state.streams.filter((s) => s.resolutionTier === filter)), [state.streams, filter]);
  const sorted = useMemo(() => sortStreams(filtered, sort), [filtered, sort]);
  const { content } = state;
  const nextSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length]!.id);

  return (
    <div className="sources">
      {content.backdropUrl ?? content.posterUrl ? <img className="sources__bg" src={(content.backdropUrl ?? content.posterUrl) as string} alt="" referrerPolicy="no-referrer" /> : null}
      <div className="sources__veil" />
      <InfoPanel content={content} onBack={onBack} />
      <div className="sources__main">
        <h1 className="t-headline-sm" style={{ margin: 0 }}>Select a Source</h1>
        <p className="t-label-lg c-text-2" style={{ margin: "calc(4 * var(--dp)) 0 calc(16 * var(--dp))" }}>Choose the best quality and server for your stream.</p>
        <div className="sources__filters">
          <div className="sources__pills hide-scroll" role="group" aria-label="Filter by quality">
            {FILTERS.map((f) => (
              <Pill key={f.id} label={f.label} selected={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </div>
          <Surface className="pill" radius="999px" background="var(--surface-high)" onClick={nextSort} ariaLabel={`Sort by ${SORTS.find((s) => s.id === sort)?.label}. Activate to change.`}>
            <span className="c-text">Sort by: {SORTS.find((s) => s.id === sort)?.label}</span>
            <MdExpandMore aria-hidden="true" />
          </Surface>
        </div>
        <div className="sources__list" role="list" aria-live="polite">
          {sorted.length === 0 && state.searchingMore ? (
            <div className="sources__empty"><Spinner /><h2 className="t-title-lg">Searching for sources…</h2><p className="c-text-2 t-body-md">Checking your installed addons for this title.</p></div>
          ) : sorted.length === 0 ? (
            <div className="sources__empty"><MdSearchOff size={40} className="c-text-3" aria-hidden="true" /><h2 className="t-title-lg">No sources found</h2><p className="c-text-2 t-body-md">Try installing more addons to find sources for this title.</p><MangoButton text="Manage Addons" icon={<MdExtension />} onClick={onManage} /></div>
          ) : (
            <>
              {state.searchingMore ? <div className="sources__more"><Spinner small /> <span className="t-label-md c-text-2">Looking for more sources…</span></div> : null}
              {sorted.map((stream, index) => (
                <SourceRow key={stream.id} stream={stream} recommended={stream.id === state.recommendedId} onClick={() => onSelect(stream)} autoFocus={index === 0} />
              ))}
            </>
          )}
        </div>
        <div className="safety">
          <div className="safety__rule" />
          <div className="safety__row">
            <MdSecurity className="c-text-2" aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-label-md">Safe & secure</div>
              <div className="t-label-sm c-text-2">All sources are scanned for your safety</div>
            </div>
            <MangoButton text="How it works" icon={<MdInfo />} compact onClick={() => setShowHelp(true)} />
          </div>
        </div>
      </div>
      {showHelp ? <SourcesHelp onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
}

function SourcesHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="How sources work" data-spatial-trap="true" style={{ flexDirection: "column", maxWidth: 560 }}>
        <h2 className="t-title-lg" style={{ margin: 0 }}>How sources work</h2>
        <p className="c-text-2 t-body-md">Each installed addon can offer its own streams for a title. Pick one — the recommended source is the highest quality one your browser can play.</p>
        <p className="c-text-2 t-body-md">In a web browser, torrent and YouTube sources, plain-HTTP links, and links that need special headers can't be played. They are marked so you can choose a different source, or use the MangoTV app for those.</p>
        <MangoButton text="Got it" icon={<MdCheckCircle />} variant="filled" onClick={onClose} dataAttrs={{ autofocus: true }} />
      </div>
    </div>
  );
}

function InfoPanel({ content, onBack }: { content: Content; onBack: () => void }) {
  const gr = [content.genres.length ? content.genres.map((g) => g.name).join("  •  ") : null, content.runtimeMinutes ? formatRuntime(content.runtimeMinutes) : null].filter(Boolean).join("   ");
  return (
    <aside className="sources__info">
      <IconButton icon={<MdArrowBack />} label="Back" clickSound="back" onClick={onBack} />
      {content.posterUrl ? <img className="sources__poster" src={content.posterUrl} alt={content.title} referrerPolicy="no-referrer" /> : null}
      <div className="sources__meta">
        {content.year ? <span className="t-label-lg c-text-2">{content.year}</span> : null}
        {content.ageRating ? <span className="detail__age t-label-sm c-text-2">{content.ageRating}</span> : null}
      </div>
      {content.logoUrl ? <img className="sources__logo" src={content.logoUrl} alt={content.title} referrerPolicy="no-referrer" /> : <h2 className="t-headline-sm clamp-2" style={{ margin: "calc(8 * var(--dp)) 0 0" }}>{content.title}</h2>}
      {gr ? <p className="t-label-lg c-text-2" style={{ margin: "calc(8 * var(--dp)) 0 0" }}>{gr}</p> : null}
      {content.description ? <p className="t-label-lg c-text-2 clamp-4" style={{ margin: "calc(10 * var(--dp)) 0 0" }}>{content.description}</p> : null}
      <div style={{ flex: 1 }} />
      <div className="sources__what">
        <div>
          <div className="t-label-md" style={{ display: "flex", gap: 5, alignItems: "center" }}><MdInfo className="c-text-2" aria-hidden="true" /> What are sources?</div>
          <p className="t-label-sm c-text-2" style={{ margin: "4px 0 0" }}>Sources are different streams or files available online. Choose the one that works best for you.</p>
        </div>
        <GlowPlay size={30} glow={46} icon={15} />
      </div>
    </aside>
  );
}

export function GlowPlay({ size = 36, glow, icon = 18 }: { size?: number; glow?: number; icon?: number }) {
  const g = glow ?? size * 1.6;
  return (
    <span className="glowplay" style={{ width: `calc(${g} * var(--dp))`, height: `calc(${g} * var(--dp))` }} aria-hidden="true">
      <span className="glowplay__halo" />
      <span className="glowplay__dot" style={{ width: `calc(${size} * var(--dp))`, height: `calc(${size} * var(--dp))` }}>
        <MdPlayArrow style={{ width: `calc(${icon} * var(--dp))`, height: `calc(${icon} * var(--dp))` }} />
      </span>
    </span>
  );
}

const TIER_COLOR: Record<ResolutionTier, string> = { UHD_4K: "var(--amber)", FHD_1080P: "var(--azure)", HD_720P: "var(--teal)", OTHER: "var(--text-3)" };
const HEALTH_COLOR = { VERY_HIGH: "var(--teal)", HIGH: "var(--teal)", GOOD: "var(--azure)", LOW: "var(--text-3)" } as const;

function SourceRow({ stream, recommended, onClick, autoFocus }: { stream: Stream; recommended: boolean; onClick: () => void; autoFocus?: boolean }) {
  const play = assessStream(stream);
  const subtitle = [stream.codec, stream.sourceTag].filter(Boolean).join("  •  ");
  const color = TIER_COLOR[stream.resolutionTier];
  return (
    <div className="source" role="listitem" data-unplayable={play.level === "no" || undefined}>
      <Surface className="source__surface" background="var(--surface-high)" alwaysBorder={recommended} borderColor={recommended ? "var(--amber)" : undefined} onClick={onClick} dataAttrs={{ autofocus: autoFocus }} ariaLabel={`${stream.qualityBadge} ${stream.releaseTitle}, ${stream.providerLabel}${recommended ? ", recommended" : ""}${play.level === "no" ? ", not playable in a browser" : ""}`}>
        <span className="source__badge" style={{ borderColor: color, color }}>
          <span className="t-label-lg">{stream.qualityBadge}</span>
          {stream.sourceTag ? <span className="t-label-sm">{stream.sourceTag}</span> : null}
        </span>
        <span className="source__body">
          <span className="t-label-lg ellipsis" style={{ fontWeight: 700 }}>{stream.releaseTitle}</span>
          {subtitle ? <span className="t-label-md c-text-2 ellipsis">{subtitle}</span> : null}
          <span className="source__facts t-label-sm c-text-3">
            {stream.seedersLabel ? <span className="source__fact"><MdPerson aria-hidden="true" />{stream.seedersLabel} seeders</span> : null}
            {stream.sourceHealth ? <span className="source__fact" style={{ color: HEALTH_COLOR[stream.sourceHealth] }}><MdOutlineCheckCircle aria-hidden="true" />{SOURCE_HEALTH_LABEL[stream.sourceHealth]}</span> : null}
            {stream.audioTag ? <span className="source__fact"><MdSurroundSound aria-hidden="true" />{stream.audioTag}</span> : null}
            {play.level !== "ok" ? <span className="source__fact source__warn" title={play.reason}><MdWarningAmber aria-hidden="true" />{play.level === "no" ? "Not supported in browser" : "May not play in browser"}</span> : null}
          </span>
        </span>
        <span className="source__side">
          {stream.sizeLabel ? <span className="t-label-md c-text-2 ellipsis">{stream.sizeLabel}</span> : null}
          <span className="t-label-sm c-text-3 source__prov"><MdWifi aria-hidden="true" /><span className="ellipsis">{stream.providerLabel}</span></span>
        </span>
        <GlowPlay size={28} glow={38} icon={13} />
      </Surface>
      {recommended ? <span className="source__reco"><MdStar aria-hidden="true" /> Recommended</span> : null}
    </div>
  );
}
