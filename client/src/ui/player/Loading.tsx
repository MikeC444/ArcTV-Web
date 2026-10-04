import { useState, type ReactNode } from "react";
import { MdArrowBack } from "react-icons/md";
import type { PlayerArt } from "../../state/playerArt";
import { IconButton } from "../components/Buttons";
import { Spinner } from "../components/States";

/** Shown while a title is opening: its picture behind its logo (or name), with a loading symbol underneath. */
export function PlayerLoading({ art, caption, busy = true, onBack, children }: { art: PlayerArt | null; caption?: string | null; busy?: boolean; onBack?: () => void; children?: ReactNode }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);
  return (
    <div className="ploading" role="status" aria-label={art ? `Loading ${art.title}` : "Loading"}>
      {art?.backdropUrl ? <img className="ploading__bg" data-ready={backdropReady} src={art.backdropUrl} alt="" referrerPolicy="no-referrer" onLoad={() => setBackdropReady(true)} /> : null}
      <div className="ploading__scrim" />
      {onBack ? (
        <div className="ploading__back">
          <IconButton icon={<MdArrowBack />} label="Back" showBackground={false} borderColor="#fff" clickSound="back" onClick={onBack} />
        </div>
      ) : null}
      <div className="ploading__center">
        {art?.logoUrl && !logoFailed ? (
          <img className="ploading__logo" src={art.logoUrl} alt={art.title} referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
        ) : art ? (
          <h1 className="ploading__title">{art.title}</h1>
        ) : null}
        {caption ? <div className="ploading__caption t-label-md">{caption}</div> : null}
        {busy ? <Spinner white /> : null}
        {children}
      </div>
    </div>
  );
}
