import { useEffect, useMemo, useState } from "react";
import { MdAdd, MdCheck, MdCheckCircle, MdMoreVert, MdOutlineCheckCircle, MdPerson, MdPlayArrow, MdStar, MdTheaters } from "react-icons/md";
import { useNavigate, useParams } from "react-router-dom";
import type { Content, ContentType, Episode, Season } from "../../domain/types";
import type { LookupState } from "../../state/detailData";
import { formatReleaseDate, formatRuntime } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { useContinueWatching } from "../../state/continueWatching";
import { useDetail } from "../../state/detailData";
import { useAccountAction, useWatchedIds } from "../../state/hooks";
import { findLastStreamId } from "../../state/lastSource";
import { useMyList } from "../../state/myList";
import { stashDetailPreview } from "../../state/pendingDetail";
import { IconButton, MangoButton } from "../components/Buttons";
import { BackButton } from "../components/BackButton";
import { ContentRow } from "../components/ContentRow";
import { HomeSkeleton } from "../components/Skeletons";
import { FullScreenError } from "../components/States";
import { Surface } from "../components/Surface";

export function DetailScreen() {
  const params = useParams<{ providerId: string; type: string; id: string }>();
  const providerId = params.providerId ?? "";
  const id = params.id ?? "";
  const type: ContentType = params.type === "TV_SHOW" ? "TV_SHOW" : "MOVIE";
  const watchedIds = useWatchedIds();
  const { state, trailer, releaseDate, reload } = useDetail(providerId, type, id, watchedIds);

  useEffect(() => {
    if (state.kind === "success") document.title = `${state.content.title} · Arc TV`;
  }, [state]);

  if (state.kind === "loading") return <HomeSkeleton />;
  if (state.kind === "error") return <FullScreenError message={state.message} onRetry={reload} />;
  return <DetailContent key={state.content.id} content={state.content} similar={state.similar} providerId={providerId} trailer={trailer} releaseDate={releaseDate.kind === "found" ? releaseDate.value : releaseDate.kind === "notFound" ? "none" : null} />;
}

function DetailContent({ content, similar, providerId, trailer, releaseDate }: { content: Content; similar: Content[]; providerId: string; trailer: LookupState<string>; releaseDate: string | "none" | null }) {
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const items = useMyList((s) => s.items);
  const toggle = useAccountAction(useMyList((s) => s.toggle));
  const toggleWatched = useAccountAction(useMyList((s) => s.toggleWatched));
  const signedIn = useAuth((s) => s.status === "signedIn");
  const openTrailer = useAccountAction((videoId: string | null) => {
    if (videoId) window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, "_blank", "noopener,noreferrer");
  });
  const resume = useContinueWatching((s) => s.items.find((e) => e.providerId === providerId && e.contentId === content.id && e.contentType === content.type));
  const inList = items.some((i) => i.id === content.id);
  const [expanded, setExpanded] = useState(false);
  const compact = content.type === "MOVIE";
  const withProvider = useMemo(() => ({ ...content, providerId: content.providerId ?? providerId }), [content, providerId]);

  const goPlay = (season: number | null, episode: number | null) => {
    const last = userId ? findLastStreamId(userId, providerId, content.id, content.type, season, episode) : null;
    navigate(last ? routes.player(providerId, content.type, content.id, season, episode, last) : routes.sources(providerId, content.type, content.id, season, episode));
  };

  const resumeEpisode = resume?.seasonNumber != null && resume.episodeNumber != null ? content.seasons.find((s) => s.seasonNumber === resume.seasonNumber)?.episodes.find((e) => e.episodeNumber === resume.episodeNumber) : undefined;
  const firstEpisode: Episode | undefined = content.type === "TV_SHOW" ? resumeEpisode ?? content.seasons[0]?.episodes[0] : undefined;
  const actionLabel = resume ? "Resume" : "Play";
  const playLabel = content.type === "TV_SHOW" && firstEpisode ? `${actionLabel} S${firstEpisode.seasonNumber}E${firstEpisode.episodeNumber}` : actionLabel;

  const releaseLabel = releaseDate && releaseDate !== "none" ? formatReleaseDate(releaseDate) ?? (content.year ? String(content.year) : null) : releaseDate === "none" ? (content.year ? String(content.year) : null) : null;
  const leading = [releaseLabel, content.runtimeMinutes ? formatRuntime(content.runtimeMinutes) : null].filter(Boolean).join("   ");
  const isWatched = content.watched;

  return (
    <div className="detail" data-compact={compact}>
      <div className="detail__backdrop" aria-hidden="true">
        {content.backdropUrl ? <img src={content.backdropUrl} alt="" referrerPolicy="no-referrer" /> : null}
        <div className="detail__scrim" />
      </div>

      <BackButton fallback={routes.home} className="detail__back" />

      <section className="detail__hero">
        {content.rating != null ? (
          <div className="detail__rating" aria-label={`IMDb rating ${content.rating.toFixed(1)}`}>
            <MdStar aria-hidden="true" />
            <div>
              <div className="detail__rating-value">{content.rating.toFixed(1)}</div>
              <div className="t-label-sm c-text-2">IMDb Rating</div>
            </div>
          </div>
        ) : null}

        <div className="detail__col">
          {content.logoUrl ? <img className="detail__logo" src={content.logoUrl} alt={content.title} referrerPolicy="no-referrer" /> : <h1 className="t-display-lg hero-shadow clamp-2">{content.title}</h1>}
          <div className="detail__meta hero-shadow">
            {leading ? <span>{leading}</span> : null}
            {content.ageRating ? <span className="detail__age">{content.ageRating}</span> : null}
          </div>
          {content.genres.length ? <p className="detail__genres hero-shadow">{content.genres.map((g) => g.name).join("  ·  ")}</p> : null}
          {compact ? <div className="detail__spacer" /> : null}
          {content.description ? <p className={`detail__desc hero-shadow ${compact ? "clamp-2" : "clamp-4"}`}>{content.description}</p> : null}
          <div className="detail__actions">
            <MangoButton text={playLabel} icon={<MdPlayArrow />} variant="light" compact={compact} dataAttrs={{ autofocus: true }} onClick={() => goPlay(firstEpisode?.seasonNumber ?? null, firstEpisode?.episodeNumber ?? null)} />
            {/* Always there from the first paint (it used to appear once the lookup finished): dimmed while the lookup runs or when there is none. Trailers come from the account's service, so visitors are taken to sign in. */}
            <MangoButton
              text="Trailer"
              icon={<MdTheaters />}
              compact={compact}
              disabled={signedIn && trailer.kind !== "found"}
              title={signedIn && trailer.kind === "notFound" ? "No trailer found for this title" : undefined}
              onClick={() => openTrailer(trailer.kind === "found" ? trailer.value : null)}
            />
            {expanded ? (
              <div className="detail__extra">
                <IconButton compact={compact} icon={isWatched ? <MdCheckCircle /> : <MdOutlineCheckCircle />} label={isWatched ? "Remove from Watched" : "Mark as watched"} onClick={() => toggleWatched(withProvider)} />
                <IconButton compact={compact} icon={inList ? <MdCheck /> : <MdAdd />} label={inList ? "Remove from Watchlist" : "Add to Watchlist"} onClick={() => toggle(withProvider)} />
              </div>
            ) : null}
            <IconButton compact={compact} icon={<MdMoreVert />} label="More options" ariaPressed={expanded} onClick={() => setExpanded((e) => !e)} />
          </div>
        </div>
      </section>

      {content.type === "TV_SHOW" && content.seasons.length > 0 ? (
        <SeasonsSection seasons={content.seasons} initialSeason={resumeEpisode?.seasonNumber} onPlay={(e) => goPlay(e.seasonNumber, e.episodeNumber)} />
      ) : (
        <div className="detail__below">
          <CastRow cast={content.cast} compact={compact} />
          {similar.length > 0 ? (
            compact ? (
              <SimilarRow items={similar} />
            ) : (
              <div className="detail__similar">
                <ContentRow section={{ id: "similar", title: "You May Also Like", items: similar, style: "STANDARD" }} />
              </div>
            )
          ) : null}
        </div>
      )}
      <div style={{ height: compact ? "calc(16 * var(--dp))" : "calc(48 * var(--dp))" }} />
    </div>
  );
}

function SeasonsSection({ seasons, initialSeason, onPlay }: { seasons: Season[]; initialSeason?: number; onPlay: (episode: Episode) => void }) {
  const [selected, setSelected] = useState(Math.max(0, seasons.findIndex((s) => s.seasonNumber === initialSeason)));
  const season = seasons[selected];
  if (!season) return null;
  return (
    <section className="seasons" aria-label="Seasons">
      <h2 className="row__title" style={{ margin: 0 }}>Seasons</h2>
      <div className="seasons__pills hide-scroll" role="group" aria-label="Choose a season">
        {seasons.map((s, i) => (
          <Surface key={s.seasonNumber} className="season-pill" radius="50%" ariaPressed={i === selected} ariaLabel={`Season ${s.seasonNumber}`} onClick={() => setSelected(i)} dataAttrs={{ selected: i === selected }}>
            {s.seasonNumber}
          </Surface>
        ))}
      </div>
      <div className="seasons__head">
        <h3 className="t-headline-sm" style={{ margin: 0 }}>{season.name}</h3>
        <span className="c-text-3 t-body-md">{season.episodes.length} Episodes</span>
      </div>
      <div className="row__scroller hide-scroll seasons__eps" style={{ ["--scale" as string]: 1 }}>
        {season.episodes.map((episode) => (
          <div className="episode" key={episode.id}>
            <Surface className="episode__thumb" background="var(--surface-high)" onClick={() => onPlay(episode)} ariaLabel={`Play episode ${episode.episodeNumber}: ${episode.title}`}>
              {episode.thumbnailUrl ? <img className="card__img" src={episode.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
              <span className="episode__play"><MdPlayArrow /></span>
            </Surface>
            <div className="episode__title">
              <span className="ellipsis t-title-md">{`${episode.episodeNumber}. ${episode.title}`}</span>
              {episode.runtimeMinutes ? <span className="c-text-3 t-label-sm">{episode.runtimeMinutes}m</span> : null}
            </div>
            {episode.description ? <p className="c-text-2 t-body-md clamp-2" style={{ marginTop: "calc(4 * var(--dp))" }}>{episode.description}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CastRow({ cast, compact }: { cast: Content["cast"]; compact: boolean }) {
  if (cast.length === 0) return <div />;
  return (
    <section className="cast" data-compact={compact} aria-label="Cast">
      <h2 className={compact ? "t-title-lg" : "t-headline-sm"} style={{ margin: 0, padding: `0 0 calc(${compact ? 6 : 12} * var(--dp)) var(--pad-x)` }}>Cast</h2>
      <div className="row__scroller hide-scroll cast__list" style={{ ["--scale" as string]: 1 }} role="group" aria-label="Cast members" tabIndex={0}>
        {cast.map((member) => (
          <div className="cast__member" key={member.name}>
            <span className="cast__avatar" aria-hidden="true">
              {member.photoUrl ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" /> : <MdPerson />}
            </span>
            <span className={`ellipsis ${compact ? "t-label-md" : "t-label-lg"}`}>{member.name}</span>
            {member.role ? <span className="ellipsis t-label-sm c-text-2">{member.role}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** SimilarRow.kt — compact 160×96dp backdrop cards used on movie Detail pages. */
function SimilarRow({ items }: { items: Content[] }) {
  return (
    <section className="similar" aria-label="You May Also Like">
      <h2 className="t-title-lg" style={{ margin: 0, padding: `calc(6 * var(--dp)) var(--pad-x)` }}>You May Also Like</h2>
      <div className="row__scroller hide-scroll" style={{ ["--scale" as string]: 0.7 }}>
        {items.map((c) => (
          <Surface key={c.id} to={c.providerId ? routes.detail(c.providerId, c.type, c.id) : undefined} className="similar__card" background="var(--surface)" onClick={() => stashDetailPreview(c)}>
            {(c.backdropUrl ?? c.posterUrl) ? <img className="card__img" src={(c.backdropUrl ?? c.posterUrl) as string} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
            <span className="similar__shade" />
            <span className="similar__text">
              <span className="t-label-lg clamp-2">{c.title}</span>
              {c.year ? <span className="t-label-sm c-text-3">{c.year}</span> : null}
            </span>
          </Surface>
        ))}
      </div>
    </section>
  );
}

