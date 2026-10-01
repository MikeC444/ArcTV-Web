import { MdCheck, MdMoreVert } from "react-icons/md";
import { routes } from "../../lib/routes";
import { useCardMenu } from "../../state/cardMenu";
import { stashDetailPreview } from "../../state/pendingDetail";
import type { Content, RowStyle } from "../../domain/types";
import { Surface } from "./Surface";

interface ContentCardProps {
  content: Content;
  style?: RowStyle;
  autoFocus?: boolean;
  /** Where a click goes; defaults to the Detail page (Continue Watching resumes via the menu / Detail). */
  to?: string;
}

/** ui/components/ContentCard.kt — poster (or 16:9 backdrop for Continue Watching), watched tick, rating on focus, progress bar. Its size comes from the row / grid it sits in (--poster-cols). */
export function ContentCard({ content, style = "STANDARD", autoFocus, to }: ContentCardProps) {
  const openMenu = useCardMenu((s) => s.open);
  const isCw = style === "CONTINUE_WATCHING";
  const image = isCw ? content.backdropUrl : content.posterUrl;
  const progress = content.watchProgress;
  const fraction = progress && progress.durationMs > 0 ? Math.min(1, Math.max(0, progress.positionMs / progress.durationMs)) : 0;
  const providerId = content.providerId ?? "";
  const target = to ?? (providerId ? routes.detail(providerId, content.type, content.id) : undefined);

  return (
    <div className="card" data-cw={isCw || undefined}>
      <Surface
        to={target}
        className="card__surface"
        onClick={() => stashDetailPreview(content)}
        onLongPress={() => openMenu(content)}
        ariaLabel={`${content.title}${content.year ? ` (${content.year})` : ""}${content.watched ? ", watched" : ""}`}
        autoFocus={autoFocus}
        dataAttrs={{ contentId: content.id }}
      >
        {image ? <img className="card__img" src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} /> : <div className="card__placeholder">{content.title}</div>}
        {content.watched ? (
          <span className="card__watched" aria-hidden="true">
            <MdCheck />
          </span>
        ) : null}
        {!isCw ? <div className="card__rating">{content.rating != null ? `★ ${content.rating.toFixed(1)}` : null}</div> : null}
        {isCw ? (
          <>
            <div className="card__cw-scrim" />
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
      ) : content.year ? (
        <div className="card__sub">{content.year}</div>
      ) : null}
    </div>
  );
}
