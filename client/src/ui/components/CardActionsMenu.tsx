import { useEffect, useMemo, useRef } from "react";
import { MdAdd, MdCheck, MdCheckCircle, MdDelete, MdInfo, MdList, MdOutlineCheckCircle, MdPlayArrow, MdThumbDown, MdThumbUp, MdOutlineThumbDown, MdOutlineThumbUp } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatElapsed } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { useCardMenu } from "../../state/cardMenu";
import { useContinueWatching } from "../../state/continueWatching";
import { useAccountAction } from "../../state/hooks";
import { findLastStreamId } from "../../state/lastSource";
import { useFeedback } from "../../state/feedback";
import { useMyList } from "../../state/myList";
import { useHasPlus } from "../../state/plusAccess";
import { Surface } from "./Surface";

/** ui/components/CardActionsMenu.kt — what holding OK on a poster (or right-click / long-press) opens. */
export function CardActionsMenu() {
  const content = useCardMenu((s) => s.target);
  const close = useCardMenu((s) => s.close);
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const items = useMyList((s) => s.items);
  const toggle = useAccountAction(useMyList((s) => s.toggle));
  const toggleWatched = useAccountAction(useMyList((s) => s.toggleWatched));
  const reportProgress = useContinueWatching((s) => s.reportProgress);
  const hasPlus = useHasPlus();
  const feedback = useFeedback((s) => (content ? s.entries[content.id]?.value : undefined));
  const toggleFeedback = useAccountAction(useFeedback((s) => s.toggle));
  const first = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!content) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => first.current?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [content, close]);

  const state = useMemo(() => {
    if (!content) return null;
    const saved = items.find((i) => i.id === content.id);
    return { inList: !!saved, watched: saved?.watched === true };
  }, [content, items]);

  if (!content || !state) return null;
  const providerId = content.providerId;
  const progress = content.watchProgress;

  const go = (to: string) => {
    close();
    navigate(to);
  };
  const play = () => {
    if (!providerId) return;
    const season = progress?.seasonNumber ?? null;
    const episode = progress?.episodeNumber ?? null;
    const last = userId ? findLastStreamId(userId, providerId, content.id, content.type, season, episode) : null;
    go(last ? routes.player(providerId, content.type, content.id, season, episode, last) : routes.sources(providerId, content.type, content.id, season, episode));
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Actions for ${content.title}`} data-spatial-trap="true">
        <img className="dialog__poster" src={content.posterUrl ?? content.backdropUrl ?? undefined} alt="" referrerPolicy="no-referrer" />
        <div className="dialog__body">
          <div className="dialog__title clamp-2">{content.title}</div>
          <Surface ref={first} className="actionrow" onClick={play}>
            <MdPlayArrow />
            {progress ? `Resume from ${formatElapsed(progress.positionMs)}` : "Play"}
          </Surface>
          <Surface
            className="actionrow"
            onClick={() => {
              toggle(content);
              close();
            }}
          >
            {state.inList ? <MdCheck /> : <MdAdd />}
            {state.inList ? "Remove from My List" : "Add to My List"}
          </Surface>
          <Surface
            className="actionrow"
            onClick={() => {
              toggleWatched(content);
              close();
            }}
          >
            {state.watched ? <MdCheckCircle /> : <MdOutlineCheckCircle />}
            {state.watched ? "Remove from Watched" : "Mark as watched"}
          </Surface>
          {hasPlus && content.type === "MOVIE" ? (
            <>
              <Surface
                className="actionrow"
                onClick={() => {
                  toggleFeedback(content, "like");
                  close();
                }}
              >
                {feedback === "like" ? <MdThumbUp /> : <MdOutlineThumbUp />}
                {feedback === "like" ? "Remove like" : "Like"}
              </Surface>
              <Surface
                className="actionrow"
                onClick={() => {
                  toggleFeedback(content, "dislike");
                  close();
                }}
              >
                {feedback === "dislike" ? <MdThumbDown /> : <MdOutlineThumbDown />}
                {feedback === "dislike" ? "Remove “Not for me”" : "Not for me"}
              </Surface>
            </>
          ) : null}
          {providerId ? (
            <Surface className="actionrow" onClick={() => go(routes.detail(providerId, content.type, content.id, content.title))}>
              <MdInfo />
              View Details
            </Surface>
          ) : null}
          {progress && providerId ? (
            <Surface
              className="actionrow"
              dataAttrs={{ destructive: true }}
              onClick={() => {
                reportProgress({
                  providerId,
                  contentId: content.id,
                  contentType: content.type,
                  seasonNumber: progress.seasonNumber ?? null,
                  episodeNumber: progress.episodeNumber ?? null,
                  episodeTitle: progress.episodeTitle ?? null,
                  title: content.title,
                  posterUrl: content.posterUrl,
                  backdropUrl: content.backdropUrl,
                  positionMs: progress.positionMs,
                  durationMs: progress.durationMs,
                  completed: true,
                });
                close();
              }}
            >
              <MdDelete />
              Remove from Continue Watching
            </Surface>
          ) : null}
          {providerId ? (
            <Surface className="actionrow" onClick={() => go(routes.sources(providerId, content.type, content.id, progress?.seasonNumber, progress?.episodeNumber, true))}>
              <MdList />
              Choose Source
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}
