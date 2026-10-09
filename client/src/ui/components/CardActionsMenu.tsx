import { useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdCheck, MdChevronRight, MdClose, MdDelete, MdInfo, MdList, MdOutlineCheckCircle, MdPlayArrow, MdThumbDown, MdThumbUp, MdOutlineThumbDown, MdOutlineThumbUp, MdVisibilityOff } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatElapsed } from "../../lib/format";
import { sharpBackdrop } from "../../lib/imageSize";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { useCardMenu } from "../../state/cardMenu";
import { useContinueWatching } from "../../state/continueWatching";
import { useAccountAction } from "../../state/hooks";
import { findLastStreamId } from "../../state/lastSource";
import { useFeedback } from "../../state/feedback";
import { useMyList } from "../../state/myList";
import { usePickedDismissed } from "../../state/pickedDismissed";
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
  const removeFromContinueWatching = useContinueWatching((s) => s.removeEntry);
  const hasPlus = useHasPlus();
  const feedback = useFeedback((s) => (content ? s.entries[content.id]?.value : undefined));
  const toggleFeedback = useAccountAction(useFeedback((s) => s.toggle));
  const dismissPick = usePickedDismissed((s) => s.dismiss);
  const first = useRef<HTMLElement>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [note, setNote] = useState(""); // what the last button press did, read out to screen readers (the buttons show it too)

  useEffect(() => setNote(""), [content]);

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

  // Taking a title out of Continue Watching does not mark it watched: its saved position is forgotten and it starts from the beginning next time.
  const continueWatchingRemoval =
    progress && providerId
      ? () => {
          removeFromContinueWatching(providerId, content.id, content.type);
          close();
        }
      : null;

  return (
    <div className="scrim cardmenu__scrim" onMouseDown={(e) => e.target === e.currentTarget && close()} role="presentation">
      <div className="cardmenu" role="dialog" aria-modal="true" aria-label={`Actions for ${content.title}`} data-spatial-trap="true">
        <Surface className="cardmenu__close" radius="999px" ariaLabel="Close" onClick={close} clickSound="back">
          <MdClose />
        </Surface>

        <div className="sr-only" role="status" aria-live="polite">{note}</div>

        {content.backdropUrl ? (
          <div className="cardmenu__banner">
            <img className="cardmenu__backdrop" src={sharpBackdrop(content.backdropUrl) ?? content.backdropUrl} alt="" referrerPolicy="no-referrer" />
            <div className="cardmenu__shade" />
            {content.logoUrl && !logoFailed ? (
              <img className="cardmenu__logo" src={content.logoUrl} alt={content.title} referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
            ) : (
              <div className="cardmenu__bannertitle clamp-2">{content.title}</div>
            )}
          </div>
        ) : (
          <div className="cardmenu__top">
            <img className="cardmenu__poster" src={content.posterUrl ?? undefined} alt="" referrerPolicy="no-referrer" />
            <div className="cardmenu__title clamp-3">{content.title}</div>
          </div>
        )}

        <Surface ref={first} className="cardmenu__play" radius="12px" onClick={play}>
          <MdPlayArrow />
          {progress ? `Resume from ${formatElapsed(progress.positionMs)}` : "Play"}
        </Surface>

        <div className="cardmenu__grid">
          <Surface
            className="cardmenu__secondary"
            radius="12px"
            ariaLabel={state.inList ? "Remove from My List" : "Add to My List"}
            dataAttrs={{ on: state.inList }}
            onClick={() => {
              toggle(content);
              setNote(state.inList ? "Removed from My List" : "Added to My List");
            }}
          >
            {state.inList ? <MdCheck /> : <MdAdd />}
            {state.inList ? "In My List" : "Add to My List"}
          </Surface>
          <Surface
            className="cardmenu__secondary"
            radius="12px"
            ariaLabel={state.watched ? "Mark as unwatched" : "Mark as watched"}
            dataAttrs={{ on: state.watched }}
            onClick={() => {
              toggleWatched(content);
              setNote(state.watched ? "Marked as unwatched" : "Marked as watched");
            }}
          >
            {state.watched ? <MdCheck /> : <MdOutlineCheckCircle />}
            {state.watched ? "Watched" : "Mark as watched"}
          </Surface>
          {hasPlus ? (
            <>
              <Surface
                className="cardmenu__secondary"
                radius="12px"
                ariaPressed={feedback === "like"}
                ariaLabel={feedback === "like" ? "Remove like" : "Like"}
                dataAttrs={{ on: feedback === "like" }}
                onClick={() => {
                  toggleFeedback(content, "like");
                  setNote(feedback === "like" ? "Like removed" : "Liked");
                }}
              >
                {feedback === "like" ? <MdThumbUp /> : <MdOutlineThumbUp />}
                Like
              </Surface>
              <Surface
                className="cardmenu__secondary"
                radius="12px"
                ariaPressed={feedback === "dislike"}
                ariaLabel={feedback === "dislike" ? "Remove “Not for me”" : "Not for me"}
                dataAttrs={{ on: feedback === "dislike" }}
                onClick={() => {
                  toggleFeedback(content, "dislike");
                  setNote(feedback === "dislike" ? "Not for me removed" : "Marked Not for me");
                }}
              >
                {feedback === "dislike" ? <MdThumbDown /> : <MdOutlineThumbDown />}
                Not for me
              </Surface>
            </>
          ) : null}
        </div>

        <div className="cardmenu__list">
          {hasPlus && content.pickedForYou ? (
            <Surface
              className="cardmenu__row"
              radius="10px"
              onClick={() => {
                dismissPick(content.id); // out of the row only: not a Like or Not for me, so it does not touch your taste profile
                close();
              }}
            >
              <MdVisibilityOff />
              <span>Remove from Picked for you</span>
            </Surface>
          ) : null}
          {providerId ? (
            <Surface className="cardmenu__row" radius="10px" onClick={() => go(routes.detail(providerId, content.type, content.id, content.title))}>
              <MdInfo />
              <span>View details</span>
              <MdChevronRight className="cardmenu__chevron" />
            </Surface>
          ) : null}
          {continueWatchingRemoval ? (
            <Surface className="cardmenu__row" radius="10px" dataAttrs={{ destructive: true }} onClick={continueWatchingRemoval}>
              <MdDelete />
              <span>Remove from Continue Watching</span>
            </Surface>
          ) : null}
          {providerId ? (
            <Surface className="cardmenu__row" radius="10px" onClick={() => go(routes.sources(providerId, content.type, content.id, progress?.seasonNumber, progress?.episodeNumber, true))}>
              <MdList />
              <span>Choose source</span>
              <MdChevronRight className="cardmenu__chevron" />
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}
