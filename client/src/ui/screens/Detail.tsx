import { useEffect, useMemo, useState } from "react";
import { MdAdd, MdCheck, MdCheckCircle, MdDownload, MdMoreVert, MdOutlineCheckCircle, MdPerson, MdPlayArrow, MdStar, MdTheaters, MdThumbDown, MdThumbUp, MdOutlineThumbDown, MdOutlineThumbUp } from "react-icons/md";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { episodeKey, firstUnwatched, type EpisodeStatus } from "../../domain/episodeProgress";
import type { Content, ContentType, Episode, Season } from "../../domain/types";
import type { LookupState } from "../../state/detailData";
import { formatReleaseDate, formatRuntime } from "../../lib/format";
import { CINEMETA_PROVIDER_ID, idFromSlug, routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { useContinueWatching } from "../../state/continueWatching";
import { useDetail } from "../../state/detailData";
import { useEpisodeStatuses } from "../../state/episodeHistory";
import { useAccountAction, useWatchedIds } from "../../state/hooks";
import { findLastStreamId } from "../../state/lastSource";
import { useMyList } from "../../state/myList";
import { stashDetailPreview } from "../../state/pendingDetail";
import { IconButton, ArcButton } from "../components/Buttons";
import { BackButton } from "../components/BackButton";
import { ContentRow } from "../components/ContentRow";
import { DownloadPanel } from "../components/DownloadPanel";
import { HomeSkeleton } from "../components/Skeletons";
import { FullScreenError } from "../components/States";
import { ScrollRow } from "../components/ScrollRow";
import { useFeedback } from "../../state/feedback";
import { useHasPlus } from "../../state/plusAccess";
import { Surface } from "../components/Surface";

/**
 * A title page. Reached by the long address (/detail/<addon>/<TYPE>/<id>) or, for Cinemeta titles, a readable one
 * (/movies/inception-tt1375666, /tv-shows/prison-break-tt0455275) — `kind` says which of those two routes this is.
 */
export function DetailScreen({ kind }: { kind?: ContentType }) {
  const params = useParams<{ providerId: string; type: string; id: string; slug: string }>();
  if (kind) {
    const slugId = idFromSlug(params.slug);
    return slugId ? <DetailPage providerId={CINEMETA_PROVIDER_ID} type={kind} id={slugId} /> : <Navigate to={routes.home} replace />;
  }
  return <DetailPage providerId={params.providerId ?? ""} type={params.type === "TV_SHOW" ? "TV_SHOW" : "MOVIE"} id={params.id ?? ""} />;
}

function DetailPage({ providerId, type, id }: { providerId: string; type: ContentType; id: string }) {
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
  const hasPlus = useHasPlus();
  const feedback = useFeedback((s) => s.entries[content.id]?.value);
  const toggleFeedback = useAccountAction(useFeedback((s) => s.toggle));
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
  const { statuses, setWatched } = useEpisodeStatuses(content, providerId, signedIn);
  // Resume where the person left off; otherwise the first episode they have not watched (the first one for a new show or one fully watched).
  const firstEpisode: Episode | undefined = content.type === "TV_SHOW" ? resumeEpisode ?? firstUnwatched(content.seasons, statuses) ?? content.seasons[0]?.episodes[0] : undefined;
  const isAdmin = useAuth((s) => s.user?.isAdmin === true);
  const canDownload = hasPlus || isAdmin;
  const [downloading, setDownloading] = useState(false);
  // The episode picked with an episode's own Download button; the Download button by Play uses the episode Play would play.
  const [pickedEpisode, setPickedEpisode] = useState<Episode | null>(null);
  const downloadEpisode = pickedEpisode ?? firstEpisode;
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
            <ArcButton text={playLabel} icon={<MdPlayArrow />} variant="light" compact={compact} dataAttrs={{ autofocus: true }} onClick={() => goPlay(firstEpisode?.seasonNumber ?? null, firstEpisode?.episodeNumber ?? null)} />
            {/* Always there from the first paint (it used to appear once the lookup finished): dimmed while the lookup runs or when there is none. Trailers come from the account's service, so visitors are taken to sign in. */}
            <ArcButton
              text="Trailer"
              icon={<MdTheaters />}
              compact={compact}
              disabled={signedIn && trailer.kind !== "found"}
              title={signedIn && trailer.kind === "notFound" ? "No trailer found for this title" : undefined}
              onClick={() => openTrailer(trailer.kind === "found" ? trailer.value : null)}
            />
            {/* Plus members and developer accounts (web and Mac only for now): lists the files that can be saved (for a show, the episode the Play button would play). */}
            {canDownload ? (
              <ArcButton text={content.type === "TV_SHOW" && firstEpisode ? `Download S${firstEpisode.seasonNumber}E${firstEpisode.episodeNumber}` : "Download"} icon={<MdDownload />} compact={compact} onClick={() => { setPickedEpisode(null); setDownloading(true); }} />
            ) : null}
            {expanded ? (
              <div className="detail__extra">
                <IconButton compact={compact} icon={isWatched ? <MdCheckCircle /> : <MdOutlineCheckCircle />} label={isWatched ? "Remove from Watched" : "Mark as watched"} onClick={() => toggleWatched(withProvider)} />
                <IconButton compact={compact} icon={inList ? <MdCheck /> : <MdAdd />} label={inList ? "Remove from Watchlist" : "Add to Watchlist"} onClick={() => toggle(withProvider)} />
                {hasPlus ? (
                  <>
                    <IconButton compact={compact} icon={feedback === "like" ? <MdThumbUp /> : <MdOutlineThumbUp />} label={feedback === "like" ? "Remove like" : "Like"} ariaPressed={feedback === "like"} onClick={() => toggleFeedback(content, "like")} />
                    <IconButton compact={compact} icon={feedback === "dislike" ? <MdThumbDown /> : <MdOutlineThumbDown />} label={feedback === "dislike" ? "Remove “Not for me”" : "Not for me"} ariaPressed={feedback === "dislike"} onClick={() => toggleFeedback(content, "dislike")} />
                  </>
                ) : null}
              </div>
            ) : null}
            <IconButton compact={compact} icon={<MdMoreVert />} label="More options" ariaPressed={expanded} onClick={() => setExpanded((e) => !e)} />
          </div>
        </div>
      </section>

      {content.type === "TV_SHOW" && content.seasons.length > 0 ? (
        <>
          <SeasonsSection seasons={content.seasons} initialSeason={(resumeEpisode ?? firstEpisode)?.seasonNumber} statuses={statuses} onSetWatched={signedIn ? setWatched : undefined} onDownload={canDownload ? (e) => { setPickedEpisode(e); setDownloading(true); } : undefined} onPlay={(e) => goPlay(e.seasonNumber, e.episodeNumber)} />
          <div className="detail__below">
            <CastRow cast={content.cast} compact={compact} />
          </div>
        </>
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
      {canDownload && downloading ? (
        <DownloadPanel
          target={{ type: content.type, id: content.id, season: downloadEpisode?.seasonNumber ?? null, episode: downloadEpisode?.episodeNumber ?? null }}
          title={content.type === "TV_SHOW" && downloadEpisode ? `${content.title} S${downloadEpisode.seasonNumber}E${downloadEpisode.episodeNumber}` : content.title}
          subtitle={[content.year, content.type === "TV_SHOW" ? (downloadEpisode ? `Show · S${downloadEpisode.seasonNumber}E${downloadEpisode.episodeNumber}` : "Show") : "Movie"].filter(Boolean).join(" • ")}
          backdropUrl={content.backdropUrl}
          logoUrl={content.logoUrl}
          onClose={() => { setDownloading(false); setPickedEpisode(null); }}
        />
      ) : null}
    </div>
  );
}

function SeasonsSection({ seasons, initialSeason, statuses, onSetWatched, onDownload, onPlay }: { seasons: Season[]; initialSeason?: number; statuses: Map<string, EpisodeStatus>; onSetWatched?: (episodes: Episode[], watched: boolean) => void; onDownload?: (episode: Episode) => void; onPlay: (episode: Episode) => void }) {
  const [selected, setSelected] = useState(Math.max(0, seasons.findIndex((s) => s.seasonNumber === initialSeason)));
  const season = seasons[selected];
  if (!season) return null;
  const isWatched = (e: Episode) => statuses.get(episodeKey(e.seasonNumber, e.episodeNumber))?.watched === true;
  const allWatched = season.episodes.length > 0 && season.episodes.every(isWatched);
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
        {onSetWatched ? (
          <Surface className="seasons__mark" radius="50%" ariaPressed={allWatched} ariaLabel={allWatched ? `Mark ${season.name} as not watched` : `Mark ${season.name} as watched`} onClick={() => onSetWatched(season.episodes, !allWatched)}>
            {allWatched ? <MdCheckCircle aria-hidden="true" /> : <MdOutlineCheckCircle aria-hidden="true" />}
            <span className="t-label-md">{allWatched ? "Season watched" : "Mark season watched"}</span>
          </Surface>
        ) : null}
      </div>
      <ScrollRow label={season.name} className="row__scroller hide-scroll seasons__eps" style={{ ["--scale" as string]: 1 }} contentKey={season.seasonNumber} resetKey={season.seasonNumber} centerOn=".episode__thumb">
        {season.episodes.map((episode) => {
          const status = statuses.get(episodeKey(episode.seasonNumber, episode.episodeNumber));
          const watched = status?.watched === true;
          const partial = !watched && status && status.fraction > 0 ? status.fraction : 0;
          return (
            <div className="episode" key={episode.id} data-watched={watched || undefined}>
              <Surface className="episode__thumb" background="var(--surface-high)" onClick={() => onPlay(episode)} ariaLabel={`Play episode ${episode.episodeNumber}: ${episode.title}${watched ? ", watched" : partial ? `, ${Math.round(partial * 100)}% watched` : ""}`}>
                {episode.thumbnailUrl ? <img className="card__img" src={episode.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
                <span className="episode__play"><MdPlayArrow /></span>
                {watched ? <span className="card__watched" aria-hidden="true"><MdCheck /></span> : null}
                {partial > 0 ? (
                  <div className="card__progress" role="progressbar" aria-valuenow={Math.round(partial * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Watched so far">
                    <span style={{ width: `${partial * 100}%` }} />
                  </div>
                ) : null}
              </Surface>
              <div className="episode__title">
                <span className="ellipsis t-title-md">{`${episode.episodeNumber}. ${episode.title}`}</span>
                {episode.runtimeMinutes ? <span className="c-text-3 t-label-sm">{episode.runtimeMinutes}m</span> : null}
                {onDownload ? (
                  <Surface className="episode__tick" radius="50%" ariaLabel={`Download episode ${episode.episodeNumber}: ${episode.title}`} onClick={() => onDownload(episode)}>
                    <MdDownload aria-hidden="true" />
                  </Surface>
                ) : null}
                {onSetWatched ? (
                  <Surface className="episode__tick" radius="50%" ariaPressed={watched} ariaLabel={watched ? `Mark episode ${episode.episodeNumber} as not watched` : `Mark episode ${episode.episodeNumber} as watched`} onClick={() => onSetWatched([episode], !watched)}>
                    {watched ? <MdCheckCircle aria-hidden="true" /> : <MdOutlineCheckCircle aria-hidden="true" />}
                  </Surface>
                ) : null}
              </div>
              {episode.description ? <p className="c-text-2 t-body-md clamp-2" style={{ marginTop: "calc(4 * var(--dp))" }}>{episode.description}</p> : null}
            </div>
          );
        })}
      </ScrollRow>
    </section>
  );
}

function CastRow({ cast, compact }: { cast: Content["cast"]; compact: boolean }) {
  if (cast.length === 0) return <div />;
  return (
    <section className="cast" data-compact={compact} aria-label="Cast">
      <h2 className={compact ? "t-title-lg" : "t-headline-sm"} style={{ margin: 0, padding: `0 0 calc(${compact ? 6 : 12} * var(--dp)) var(--pad-x)` }}>Cast</h2>
      <ScrollRow label="Cast" className="row__scroller hide-scroll cast__list" style={{ ["--scale" as string]: 1 }} contentKey={cast.length} centerOn=".cast__avatar" role="group" ariaLabel="Cast members" tabIndex={0}>
        {cast.map((member) => (
          <div className="cast__member" key={member.name}>
            <span className="cast__avatar" aria-hidden="true">
              {member.photoUrl ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" /> : <MdPerson />}
            </span>
            <span className={`ellipsis ${compact ? "t-label-md" : "t-label-lg"}`}>{member.name}</span>
            {member.role ? <span className="ellipsis t-label-sm c-text-2">{member.role}</span> : null}
          </div>
        ))}
      </ScrollRow>
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
          <Surface key={c.id} to={c.providerId ? routes.detail(c.providerId, c.type, c.id, c.title) : undefined} className="similar__card" background="var(--surface)" onClick={() => stashDetailPreview(c)}>
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

