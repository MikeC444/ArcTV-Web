import { useEffect, useRef, useState } from "react";
import { MdArrowBack, MdCheckCircle, MdClose, MdDownload, MdHourglassTop } from "react-icons/md";
import { DEBRID_NAMES } from "../../domain/deviceSupport";
import type { ContentType } from "../../domain/types";
import { hdrLabel, sourceLabel } from "../../lib/downloadLabels";
import { sharpBackdrop } from "../../lib/imageSize";
import { findDownloadOptions, type DownloadOption } from "../../state/downloadSources";
import { ArcLogo } from "./Logo";
import { Spinner } from "./States";
import { Surface } from "./Surface";

export interface DownloadTarget {
  type: ContentType;
  id: string;
  season: number | null;
  episode: number | null;
}

/**
 * Developer-only for now. Looks up the sources of one movie or episode and lists the ones that are a plain file, each a real link: the
 * browser downloads it straight from the debrid service (nothing goes through this server). It is a list, not one button, because each
 * link has to be clicked by the person (a download started after waiting for the lookup would be blocked as a pop-up). The order is
 * automatic (see downloadOptions), so there is no sort or filter control.
 */
export function DownloadPanel({ target, title, subtitle, backdropUrl, logoUrl, onClose, load = findDownloadOptions }: { target: DownloadTarget; title: string; subtitle?: string; backdropUrl?: string | null; logoUrl?: string | null; onClose: () => void; load?: typeof findDownloadOptions }) {
  const [options, setOptions] = useState<DownloadOption[] | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let cancelled = false;
    void load(target.type, target.id, target.season, target.episode).then((found) => !cancelled && setOptions(found), () => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
  }, [load, target.type, target.id, target.season, target.episode]);

  useEffect(() => {
    if (options && options.length > 0) first.current?.focus();
  }, [options]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim dlpanel__scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="dlpanel__wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="dlpanel__brand"><ArcLogo size={22} /></div>
        <div className="dlpanel" role="dialog" aria-modal="true" aria-label={`Download ${title}`} data-spatial-trap="true">
          {/* Like the right-click menu: the title's backdrop picture fills the top, with its logo (or its name) over it. */}
          <div className="dlpanel__banner" data-plain={backdropUrl ? undefined : "true"}>
            {backdropUrl ? (
              <>
                <img className="dlpanel__backdrop" src={sharpBackdrop(backdropUrl) ?? backdropUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { if (e.currentTarget.src !== backdropUrl) e.currentTarget.src = backdropUrl; }} />
                <div className="dlpanel__shade" />
              </>
            ) : null}
            <div className="dlpanel__bannertop">
              <Surface className="dlpanel__iconbtn" radius="999px" ariaLabel="Back" onClick={onClose} clickSound="back"><MdArrowBack /></Surface>
              <h2 className="dlpanel__heading">Downloads</h2>
              <Surface className="dlpanel__iconbtn dlpanel__iconbtn--ring" radius="999px" ariaLabel="Close" onClick={onClose} clickSound="back"><MdClose /></Surface>
            </div>
            <div className="dlpanel__bannerbottom">
              {logoUrl && !logoFailed ? (
                <img className="dlpanel__logo" src={logoUrl} alt={title} referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
              ) : (
                <h3 className="dlpanel__name clamp-2">{title}</h3>
              )}
              {subtitle ? <p className="dlpanel__sub">{subtitle}</p> : null}
            </div>
          </div>

          <div className="dlpanel__body">
          {options === null ? (
            <div className="dlpanel__state"><Spinner small /> <span className="t-label-md c-text-2">Finding files…</span></div>
          ) : options.length === 0 ? (
            <p className="dlpanel__state t-label-md c-text-2">No downloadable files found. Only plain video files can be downloaded here, not streams or torrents.</p>
          ) : (
            <>
              <div className="dlpanel__count">
                <span>{options.length === 1 ? "1 source" : `${options.length} sources`}</span>
                <span className="dlpanel__order">Best quality first, then smallest</span>
              </div>
              <div className="dlpanel__list">
                {options.map((o, i) => {
                  const hdr = hdrLabel(o.stream);
                  return (
                    <a
                      key={o.stream.id}
                      ref={i === 0 ? first : undefined}
                      className="dlrow"
                      href={o.download.url}
                      download={o.download.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      aria-label={`Download ${o.stream.qualityBadge} ${sourceLabel(o.stream)}, ${o.stream.releaseTitle}${o.stream.sizeLabel ? `, ${o.stream.sizeLabel}` : ""}${o.stream.debrid && !o.stream.debrid.cached ? ". Not cached, may take a while to start" : ""}`}
                    >
                      <span className="dlrow__badge">{o.stream.qualityBadge}</span>
                      <span className="dlrow__body">
                        <span className="dlrow__label">{sourceLabel(o.stream)}</span>
                        <span className="dlrow__file ellipsis">{o.stream.releaseTitle}</span>
                        <span className="dlrow__facts">
                          {o.stream.sizeLabel ? <span className="dlrow__size">{o.stream.sizeLabel}</span> : null}
                          {o.stream.codec ? <span>{o.stream.codec}</span> : null}
                          {hdr ? <span className="dlrow__chip">{hdr}</span> : null}
                          {o.stream.debrid ? (
                            <span className="dlrow__cache" data-cached={o.stream.debrid.cached}>
                              {o.stream.debrid.cached ? <MdCheckCircle aria-hidden="true" /> : <MdHourglassTop aria-hidden="true" />}
                              {o.stream.debrid.cached ? `Cached on ${DEBRID_NAMES[o.stream.debrid.service] ?? o.stream.debrid.service}` : "Not cached: may take a while to start"}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="dlrow__go" aria-hidden="true"><MdDownload /></span>
                    </a>
                  );
                })}
              </div>
              <p className="dlpanel__foot">Choose a source to download the file.</p>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
