import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { MdCheck, MdMoreVert } from "react-icons/md";
import { cardBackdrop } from "../../lib/imageSize";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { findLastStreamId } from "../../state/lastSource";
import { useCardMenu } from "../../state/cardMenu";
import { stashDetailPreview } from "../../state/pendingDetail";
import { useTitleLogo } from "../../state/titleLogo";
import type { Content, RowStyle } from "../../domain/types";
import { Surface } from "./Surface";

interface ContentCardProps {
  content: Content;
  style?: RowStyle;
  autoFocus?: boolean;
  /** Where a click goes; defaults to the Detail page, except a Continue Watching poster, which carries straight on (the player on the source it was watched on, or the source list the first time). */
  to?: string;
  /** Drawn inside the poster's frame, so it scales and tilts with the poster (the Top 10 row's service logo). */
  badge?: ReactNode;
  /** A 16:9 card with the title's backdrop (its poster if it has none) instead of the tall poster, without Continue Watching's progress, logo or resume link. */
  wide?: boolean;
}

/** Tips a hovered poster toward the mouse and moves a soft glare with it (the CSS reads these on the poster's frame, never on the picture; nothing tilts with reduced motion or on touch). */
function tiltToward(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse") return;
  const surface = event.currentTarget.querySelector<HTMLElement>(".card__surface");
  if (!surface) return;
  const box = surface.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
  surface.style.setProperty("--tilt-x", `${((0.5 - y) * 12).toFixed(1)}deg`);
  surface.style.setProperty("--tilt-y", `${((x - 0.5) * 12).toFixed(1)}deg`);
  surface.style.setProperty("--glare-x", `${(x * 100).toFixed(0)}%`);
  surface.style.setProperty("--glare-y", `${(y * 100).toFixed(0)}%`);
}
function resetTilt(event: PointerEvent<HTMLDivElement>) {
  const surface = event.currentTarget.querySelector<HTMLElement>(".card__surface");
  for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) surface?.style.removeProperty(name);
}

/** ui/components/ContentCard.kt — poster (or 16:9 backdrop for Continue Watching), watched tick, rating on focus, progress bar. Its size comes from the row / grid it sits in (--poster-cols). */
export function ContentCard({ content, style = "STANDARD", autoFocus, to, badge, wide }: ContentCardProps) {
  const openMenu = useCardMenu((s) => s.open);
  // a Continue Watching poster carries the title's logo in its top left corner (looked up, as the saved entry has none)
  // a wide card shows it too, at its bottom left, but only looks it up once the card is near the screen (a catalogue page holds hundreds of them)
  const rootRef = useRef<HTMLDivElement>(null);
  const [nearScreen, setNearScreen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!wide || !el || nearScreen) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setNearScreen(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNearScreen(true), { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [wide, nearScreen]);
  const logo = useTitleLogo(content, style === "CONTINUE_WATCHING" || (!!wide && nearScreen));
  const [logoFailed, setLogoFailed] = useState(false);
  const [smallFailed, setSmallFailed] = useState(false);
  const isCw = style === "CONTINUE_WATCHING";
  const image = isCw ? content.backdropUrl : wide ? content.backdropUrl ?? content.posterUrl : content.posterUrl;
  const progress = content.watchProgress;
  const fraction = progress && progress.durationMs > 0 ? Math.min(1, Math.max(0, progress.positionMs / progress.durationMs)) : 0;
  const providerId = content.providerId ?? "";
  const userId = useAuth((s) => s.user?.id);
  let resumeTarget: string | undefined;
  if (isCw && providerId) {
    const season = progress?.seasonNumber ?? null;
    const episode = progress?.episodeNumber ?? null;
    const last = userId ? findLastStreamId(userId, providerId, content.id, content.type, season, episode) : null;
    resumeTarget = last ? routes.player(providerId, content.type, content.id, season, episode, last) : routes.sources(providerId, content.type, content.id, season, episode);
  }
  const target = to ?? resumeTarget ?? (providerId ? routes.detail(providerId, content.type, content.id, content.title) : undefined);

  return (
    <div ref={rootRef} className="card" data-cw={isCw || undefined} data-wide={wide || undefined} onPointerEnter={isCw ? undefined : tiltToward} onPointerMove={isCw ? undefined : tiltToward} onPointerLeave={isCw ? undefined : resetTilt}>
      <Surface
        to={target}
        className="card__surface"
        onClick={() => stashDetailPreview(content)}
        onLongPress={() => openMenu(content)}
        ariaLabel={`${content.title}${content.year ? ` (${content.year})` : ""}${content.watched ? ", watched" : ""}`}
        autoFocus={autoFocus}
        dataAttrs={{ contentId: content.id }}
      >
        {image ? (
          <img
            className="card__img"
            src={wide && !smallFailed ? cardBackdrop(image) ?? image : image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // the smaller size is not there: try the address as it came, then give up
              if (wide && !smallFailed && cardBackdrop(image) !== image) setSmallFailed(true);
              else e.currentTarget.style.display = "none";
            }}
          />
        ) : <div className="card__placeholder">{content.title}</div>}
        {badge}
        {content.watched ? (
          <span className="card__watched" aria-hidden="true">
            <MdCheck />
          </span>
        ) : null}
        {!isCw ? <div className="card__rating">{content.rating != null ? `★ ${content.rating.toFixed(1)}` : null}</div> : null}
        {wide && logo && !logoFailed ? (
          <>
            <div className="card__cw-scrim" />
            <img className="card__logo card__logo--wide" src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
          </>
        ) : null}
        {isCw ? (
          <>
            <div className="card__cw-scrim" />
            {logo && !logoFailed ? (
              <>
                <div className="card__cw-scrim-top" />
                <img className="card__logo" src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
              </>
            ) : null}
            {progress ? (
              <div className="card__progress" role="progressbar" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Watched so far">
                <span style={{ width: `${fraction * 100}%` }} />
              </div>
            ) : null}
          </>
        ) : null}
      </Surface>
      {/* Touch screens can't right-click or hold: a button on the poster's corner opens the same quick-actions menu (hidden where a mouse is available). */}
      <button type="button" className="card__more" aria-label={`More options for ${content.title}`} aria-haspopup="dialog" onClick={() => openMenu(content)}>
        <MdMoreVert aria-hidden="true" />
      </button>
      <div className="card__title" title={content.title}>
        {content.title}
      </div>
      {isCw ? (
        progress?.seasonNumber != null && progress.episodeNumber != null ? (
          <div className="card__sub ellipsis">{`S${progress.seasonNumber} E${progress.episodeNumber}`}</div>
        ) : null
      ) : content.recommendReason ? (
        <div className="card__sub card__why clamp-2">{content.recommendReason}</div>
      ) : content.year ? (
        <div className="card__sub">{content.year}</div>
      ) : null}
    </div>
  );
}
