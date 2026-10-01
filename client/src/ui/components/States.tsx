import type { ReactNode } from "react";
import { MdCloudOff, MdExtension, MdList, MdRefresh } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { MangoButton } from "./Buttons";

/** StateViews.kt */
export function FullScreenError({ message, onRetry, secondaryLabel, onSecondary, title = "Something went wrong" }: { message: string; onRetry?: () => void; secondaryLabel?: string; onSecondary?: () => void; title?: string }) {
  return (
    <div className="state" role="alert">
      <MdCloudOff className="state__icon state__icon--err" aria-hidden="true" />
      <h2 className="state__title">{title}</h2>
      <p className="state__msg">{message}</p>
      <div className="state__actions">
        {onRetry ? <MangoButton text="Retry" icon={<MdRefresh />} onClick={onRetry} variant="filled" dataAttrs={{ autofocus: true }} /> : null}
        {secondaryLabel && onSecondary ? <MangoButton text={secondaryLabel} icon={<MdList />} onClick={onSecondary} variant="glass" /> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, message, actionLabel, actionIcon, onAction }: { icon: ReactNode; title: string; message: string; actionLabel?: string; actionIcon?: ReactNode; onAction?: () => void }) {
  return (
    <div className="state">
      <span className="state__icon" aria-hidden="true" style={{ display: "flex" }}>
        {icon}
      </span>
      <h2 className="state__title">{title}</h2>
      <p className="state__msg">{message}</p>
      {actionLabel && onAction ? (
        <div className="state__actions">
          <MangoButton text={actionLabel} icon={actionIcon ?? <MdRefresh />} onClick={onAction} variant="filled" dataAttrs={{ autofocus: true }} />
        </div>
      ) : null}
    </div>
  );
}

export function HomeEmptyState() {
  const navigate = useNavigate();
  return <EmptyState icon={<MdExtension size={48} />} title="Your library is empty" message="Install an addon to bring movies and TV shows into ArcTV." actionLabel="Browse Addons" actionIcon={<MdExtension />} onAction={() => navigate("/settings/addons")} />;
}

export function Spinner({ small, white }: { small?: boolean; white?: boolean }) {
  return <span className={`spinner${small ? " spinner--sm" : ""}${white ? " spinner--white" : ""}`} role="status" aria-label="Loading" />;
}
