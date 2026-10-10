import { useEffect, useRef, useState } from "react";
import { MdBolt, MdClose, MdDownload, MdHourglassTop } from "react-icons/md";
import { DEBRID_NAMES } from "../../domain/deviceSupport";
import type { ContentType } from "../../domain/types";
import { findDownloadOptions, type DownloadOption } from "../../state/downloadSources";
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
 * link has to be clicked by the person (a download started after waiting for the lookup would be blocked as a pop-up).
 */
export function DownloadPanel({ target, title, onClose, load = findDownloadOptions }: { target: DownloadTarget; title: string; onClose: () => void; load?: typeof findDownloadOptions }) {
  const [options, setOptions] = useState<DownloadOption[] | null>(null);
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
      <div className="dlpanel" role="dialog" aria-modal="true" aria-label={`Download ${title}`} data-spatial-trap="true">
        <Surface className="dlpanel__close" radius="999px" ariaLabel="Close" onClick={onClose} clickSound="back">
          <MdClose />
        </Surface>
        <h2 className="t-title-lg" style={{ margin: 0 }}>Download</h2>
        <p className="t-label-md c-text-2 ellipsis" style={{ margin: "2px 0 0" }}>{title}</p>
        <p className="t-label-sm c-text-3" style={{ margin: "6px 0 14px" }}>Best quality first, smallest file first within each quality. Files save straight from your debrid service. The link has your key in it, so don't share it.</p>

        {options === null ? (
          <div className="dlpanel__state"><Spinner small /> <span className="t-label-md c-text-2">Finding files…</span></div>
        ) : options.length === 0 ? (
          <p className="dlpanel__state t-label-md c-text-2">No downloadable files found. Only plain video files can be downloaded here, not streams or torrents.</p>
        ) : (
          <div className="dlpanel__list">
            {options.map((o, i) => (
              <a
                key={o.stream.id}
                ref={i === 0 ? first : undefined}
                className="dlrow"
                href={o.download.url}
                download={o.download.filename}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                aria-label={`Download ${o.stream.qualityBadge} ${o.stream.releaseTitle}${o.stream.sizeLabel ? `, ${o.stream.sizeLabel}` : ""}${o.stream.debrid && !o.stream.debrid.cached ? ". Not cached, may take a while to start" : ""}`}
              >
                <span className="dlrow__badge t-label-lg">{o.stream.qualityBadge}</span>
                <span className="dlrow__body">
                  <span className="t-label-lg ellipsis" style={{ fontWeight: 700 }}>{o.stream.releaseTitle}</span>
                  <span className="t-label-sm c-text-3 dlrow__facts">
                    {o.stream.sizeLabel ? <span>{o.stream.sizeLabel}</span> : null}
                    {o.stream.codec ? <span>{o.stream.codec}</span> : null}
                    {o.stream.debrid ? (
                      <span className="dlrow__cache" data-cached={o.stream.debrid.cached}>
                        {o.stream.debrid.cached ? <MdBolt aria-hidden="true" /> : <MdHourglassTop aria-hidden="true" />}
                        {o.stream.debrid.cached ? `Cached on ${DEBRID_NAMES[o.stream.debrid.service] ?? o.stream.debrid.service}` : "Not cached: may take a while to start"}
                      </span>
                    ) : null}
                  </span>
                </span>
                <MdDownload className="dlrow__icon" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
