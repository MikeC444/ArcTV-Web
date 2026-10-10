import { useEffect, useRef, useState, type ReactNode } from "react";
import { MdArrowBack, MdChevronRight, MdFastForward, MdGraphicEq, MdHighQuality, MdInfo, MdPlayCircle, MdRefresh, MdSettings, MdSpeed, MdSubtitles, MdSwapHoriz, MdTune, MdCheck, MdOpenInNew } from "react-icons/md";
import type { Stream } from "../../domain/types";
import { formatSpeed } from "../../lib/format";
import { ArcButton, Switch } from "../components/Buttons";
import { Surface } from "../components/Surface";
import type { EngineTracks, TrackOption } from "./engine";

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Closes on Escape; the first control receives focus so keyboard users land inside the panel. */
function useOverlayLifecycle(onClose: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => root.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [onClose]);
  return root;
}

/** MenuOverlayScaffold — a 360dp panel sliding from the right over a dimmed video. */
export function MenuOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const root = useOverlayLifecycle(onClose);
  return (
    <div ref={root} className="pmenu" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pmenu__panel" role="dialog" aria-modal="true" aria-label={title} data-spatial-trap="true">
        <h2 className="t-headline-sm" style={{ margin: 0 }}>{title}</h2>
        <div className="pmenu__list" role="listbox" aria-label={title}>{children}</div>
      </div>
    </div>
  );
}

export function MenuOptionRow({ label, selected, onClick, supporting }: { label: string; selected: boolean; onClick: () => void; supporting?: string }) {
  return (
    <Surface className="poption" radius="var(--card-radius)" background={selected ? "rgba(255,255,255,.16)" : "var(--surface-high)"} borderColor="#fff" role="option" ariaPressed={selected} onClick={onClick}>
      <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
        <span className="t-label-lg ellipsis" style={{ color: selected ? "#fff" : "var(--text)" }}>{label}</span>
        {supporting ? <span className="t-label-sm c-text-2 ellipsis">{supporting}</span> : null}
      </span>
      {selected ? <MdCheck aria-label="Selected" /> : null}
    </Surface>
  );
}

export function TrackMenu({ title, options, offLabel, onSelect, onClose }: { title: string; options: TrackOption[]; offLabel?: string; onSelect: (id: string | null) => void; onClose: () => void }) {
  const anySelected = options.some((o) => o.selected);
  return (
    <MenuOverlay title={title} onClose={onClose}>
      {offLabel ? <MenuOptionRow label={offLabel} selected={!anySelected} onClick={() => onSelect(null)} /> : null}
      {options.map((o) => (
        <MenuOptionRow key={o.id} label={o.label} selected={o.selected} onClick={() => onSelect(o.id)} />
      ))}
    </MenuOverlay>
  );
}

export function SpeedMenu({ speed, onSelect, onClose }: { speed: number; onSelect: (s: number) => void; onClose: () => void }) {
  return (
    <MenuOverlay title="Playback Speed" onClose={onClose}>
      {PLAYBACK_SPEEDS.map((s) => (
        <MenuOptionRow key={s} label={formatSpeed(s)} selected={s === speed} onClick={() => onSelect(s)} />
      ))}
    </MenuOverlay>
  );
}

/** SettingsCardScaffold — a centred 460dp card with icon header. */
function SettingsCard({ icon, title, subtitle, onClose, children }: { icon: ReactNode; title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  const root = useOverlayLifecycle(onClose);
  return (
    <div ref={root} className="pcard-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pcard" role="dialog" aria-modal="true" aria-label={title} data-spatial-trap="true">
        <div className="pcard__head">
          <span className="pcard__icon">{icon}</span>
          <div>
            <div className="t-title-lg">{title}</div>
            <div className="t-label-md c-text-2">{subtitle}</div>
          </div>
        </div>
        <div className="pcard__rows">{children}</div>
      </div>
    </div>
  );
}

function SettingsRow({ icon, title, subtitle, onClick, trailing }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; trailing?: ReactNode }) {
  return (
    <Surface className="prow" radius="16px" background="var(--surface)" borderColor="var(--accent)" onClick={onClick}>
      <span className="pcard__icon pcard__icon--sm">{icon}</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", textAlign: "left" }}>
        <span className="t-label-lg ellipsis">{title}</span>
        <span className="t-label-sm c-text-2 ellipsis">{subtitle}</span>
      </span>
      {trailing ?? <MdChevronRight className="c-text-2" aria-hidden="true" />}
    </Surface>
  );
}

export interface SettingsPanelProps {
  tracks: EngineTracks;
  speed: number;
  autoplayNext: boolean;
  onAutoplayChange(v: boolean): void;
  /** Why there is no audio choice: the source has one track, or this browser cannot list the tracks of a plain video file. */
  audioHint: "single" | "unsupported";
  onOpen(target: "quality" | "subtitles" | "audio" | "audio-info" | "speed" | "advanced"): void;
  onClose(): void;
}

export function SettingsPanel({ tracks, speed, autoplayNext, audioHint, onAutoplayChange, onOpen, onClose }: SettingsPanelProps) {
  const label = (list: TrackOption[], fallback: string) => list.find((t) => t.selected)?.label ?? fallback;
  return (
    <SettingsCard icon={<MdSettings />} title="Settings" subtitle="Adjust your playback preferences" onClose={onClose}>
      {tracks.quality.length > 1 ? <SettingsRow icon={<MdHighQuality />} title="Quality" subtitle={label(tracks.quality, "Auto")} onClick={() => onOpen("quality")} /> : null}
      {tracks.subtitles.length > 0 ? <SettingsRow icon={<MdSubtitles />} title="Subtitles" subtitle={label(tracks.subtitles, "Off")} onClick={() => onOpen("subtitles")} /> : null}
      {tracks.audio.length > 1 ? (
        <SettingsRow icon={<MdGraphicEq />} title="Audio" subtitle={label(tracks.audio, "Auto")} onClick={() => onOpen("audio")} />
      ) : (
        <SettingsRow icon={<MdGraphicEq />} title="Audio" subtitle={audioHint === "single" ? (tracks.audio[0]?.label ?? "One audio track") : "Can't be changed for this source here"} onClick={() => onOpen("audio-info")} />
      )}
      <SettingsRow icon={<MdSpeed />} title="Playback Speed" subtitle={formatSpeed(speed)} onClick={() => onOpen("speed")} />
      <SettingsRow icon={<MdPlayCircle />} title="Auto Play Next Episode" subtitle={autoplayNext ? "On" : "Off"} onClick={() => onAutoplayChange(!autoplayNext)} trailing={<Switch checked={autoplayNext} />} />
      <SettingsRow icon={<MdTune />} title="Advanced" subtitle="Additional settings" onClick={() => onOpen("advanced")} />
    </SettingsCard>
  );
}

/** Shown when there is nothing to choose between, and says why. */
export function AudioInfoPanel({ hint, onClose }: { hint: "single" | "unsupported"; onClose(): void }) {
  return (
    <MenuOverlay title="Audio" onClose={onClose}>
      {hint === "single" ? (
        <p className="t-body-md c-text-2" style={{ margin: 0 }}>This source has a single audio track, so there is nothing to switch between. Pick another source on the Sources screen if you want a different language or mix.</p>
      ) : (
        <>
          <p className="t-body-md c-text-2" style={{ margin: 0 }}>This browser can't list or switch the audio tracks of a plain video file (MP4, MKV, WebM). If the file has several languages, you hear its default one.</p>
          <p className="t-body-md c-text-2" style={{ margin: "12px 0 0" }}>Audio can be switched here on streaming (HLS or DASH) sources, and on most files in Safari. Otherwise pick another source, or use the Fire TV app.</p>
        </>
      )}
    </MenuOverlay>
  );
}

export function AdvancedPanel({ skipIntro, onSkipIntro, onSourceInfo, onChangeSource, onClose }: { skipIntro: boolean; onSkipIntro(v: boolean): void; onSourceInfo(): void; onChangeSource(): void; onClose(): void }) {
  return (
    <SettingsCard icon={<MdTune />} title="Advanced" subtitle="Additional settings" onClose={onClose}>
      <SettingsRow icon={<MdFastForward />} title="Skip Intro" subtitle={skipIntro ? "On — applies when a title provides intro timing" : "Off"} onClick={() => onSkipIntro(!skipIntro)} trailing={<Switch checked={skipIntro} />} />
      <SettingsRow icon={<MdInfo />} title="Source Info" subtitle="Resolution, codecs & more" onClick={onSourceInfo} />
      <SettingsRow icon={<MdSwapHoriz />} title="Change Source" subtitle="Pick a different stream" onClick={onChangeSource} />
    </SettingsCard>
  );
}

export function SourceInfoPanel({ stream, tracks, engine, onClose }: { stream: Stream; tracks: EngineTracks; engine: string; onClose: () => void }) {
  const rows: Array<[string, string]> = [["Provider", stream.providerLabel], ["Resolution", stream.qualityBadge]];
  if (stream.codec) rows.push(["Video codec", stream.codec]);
  if (stream.audioTag) rows.push(["Audio", stream.audioTag]);
  if (tracks.audio.length) rows.push(["Audio tracks", String(tracks.audio.length)]);
  rows.push(["Subtitles", tracks.subtitles.length ? `${tracks.subtitles.length} available` : "None"]);
  if (stream.sizeLabel) rows.push(["File size", stream.sizeLabel]);
  rows.push(["Playback engine", engine === "hls" ? "HLS (hls.js)" : engine === "dash" ? "DASH (dash.js)" : "Native HTML5"]);
  return (
    <MenuOverlay title="Source Info" onClose={onClose}>
      <dl className="pinfo">
        {rows.map(([k, v]) => (
          <div key={k} className="pinfo__row">
            <dt className="t-label-md c-text-2">{k}</dt>
            <dd className="t-label-md ellipsis" style={{ margin: 0 }}>{v}</dd>
          </div>
        ))}
      </dl>
    </MenuOverlay>
  );
}

/** PlaybackErrorOverlay.kt — plain-language reason, plus the way out. */
export function PlaybackErrorOverlay({ message, details, onProbe, ytId, onTryAgain, onChangeSource, onBack }: { message: string; details?: string | null; onProbe?: (onLine: (line: string) => void) => Promise<unknown>; ytId?: string | null; onTryAgain(): void; onChangeSource(): void; onBack(): void }) {
  const [copied, setCopied] = useState(false);
  const [probe, setProbe] = useState<{ state: "idle" | "running" | "done"; lines: string[] }>({ state: "idle", lines: [] });
  const testing = probe.state === "running";
  const fullDetails = details ? [details, ...(probe.state !== "idle" ? ["", "Connection test:", ...probe.lines, ...(testing ? ["Testing… (up to 30 seconds)"] : [])] : [])].join("\n") : "";
  return (
    <div className="perror" role="alertdialog" aria-modal="true" aria-label="Unable to play this source" data-spatial-trap="true">
      <h2 className="t-headline-sm" style={{ margin: 0 }}>Unable to play this source</h2>
      <p className="t-body-md c-text-2" style={{ maxWidth: 560, textAlign: "center", margin: "8px 0 16px" }}>{message}</p>
      {details ? (
        <details className="perror__details">
          <summary className="t-label-md c-text-2">Technical details</summary>
          <pre className="perror__pre t-label-sm">{fullDetails}</pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="perror__copy t-label-md"
              onClick={() => {
                void navigator.clipboard?.writeText(fullDetails).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Copied" : "Copy details"}
            </button>
            {onProbe ? (
              <button
                type="button"
                className="perror__copy t-label-md"
                disabled={probe.state === "running"}
                onClick={() => {
                  setCopied(false);
                  setProbe({ state: "running", lines: [] });
                  void onProbe((line) => setProbe((p) => ({ ...p, lines: [...p.lines, line] }))).then(() => setProbe((p) => ({ ...p, state: "done" })));
                }}
              >
                {probe.state === "running" ? "Testing…" : probe.state === "done" ? "Test again" : "Test connection"}
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="perror__actions">
        <ArcButton text="Change Source" icon={<MdSwapHoriz />} borderColor="#fff" dataAttrs={{ autofocus: true }} onClick={onChangeSource} />
        <ArcButton text="Try Again" icon={<MdRefresh />} borderColor="#fff" onClick={onTryAgain} />
        {ytId ? <ArcButton text="Watch on YouTube" icon={<MdOpenInNew />} borderColor="#fff" onClick={() => window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`, "_blank", "noopener,noreferrer")} /> : null}
        <ArcButton text="Back" icon={<MdArrowBack />} borderColor="#fff" clickSound="back" onClick={onBack} />
      </div>
    </div>
  );
}
