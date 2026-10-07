import { useEffect, useRef, useState } from "react";
import { MdArrowForward, MdClose, MdFavorite, MdGroups, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { usePlus } from "../../state/plus";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { promoDue, usePlusPromo } from "../../state/plusPromo";
import { MangoLogo } from "./Logo";
import { Surface } from "./Surface";

const SHOW_AFTER_MS = 4000;

const BENEFITS = [
  { icon: <MdFavorite />, title: "Picked for you", detail: "A Home row chosen from the movies you like, with the reason under each poster." },
  { icon: <MdGroups />, title: "Up to 5 profiles", detail: "Their own My List, Continue Watching and recommendations. Add kids profiles and PIN locks." },
  { icon: <MdWorkspacePremium />, title: "And more", detail: "Smart source picking and your watch stats, with parental controls on the way." },
];

/**
 * A gentle ArcTV Plus invitation on Home. It only appears for a signed-in adult without Plus once Plus is a paid tier, a few
 * seconds after landing, once per visit. Close hides it for a week; "Don't show me again" ends it for this account.
 */
export function PlusPromo({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const hasPlus = usePlus((s) => s.active);
  const paywall = usePlus((s) => s.paywall);
  const adult = useProfiles((s) => !(s.plus && activeProfileOf(s)?.kind === "kids"));
  const ready = usePlusPromo((s) => s.userId !== null && promoDue(s));
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const eligible = enabled && signedIn && paywall && !hasPlus && adult && ready;

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = window.setTimeout(() => {
      usePlusPromo.getState().markShown();
      setOpen(true);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!open || !enabled || hasPlus) return null;

  const close = () => {
    setOpen(false);
    usePlusPromo.getState().snooze();
  };
  const never = () => {
    setOpen(false);
    usePlusPromo.getState().dismissForever();
  };
  const go = () => {
    close();
    navigate(routes.settings("plus"));
  };
  return <PromoDialog onClose={close} onNever={never} onGo={go} />;
}

export function PromoDialog({ onClose, onNever, onGo }: { onClose(): void; onNever(): void; onGo(): void }) {
  const first = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => first.current?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="promo" role="dialog" aria-modal="true" aria-labelledby="promo-title" data-spatial-trap="true">
        <Surface className="promo__x ibtn" ariaLabel="Close" title="Close" onClick={onClose} clickSound="back">
          <MdClose />
        </Surface>
        <div className="promo__brand">
          <MangoLogo size={26} />
          <span className="promo__plus">PLUS</span>
        </div>
        <h2 id="promo-title" className="promo__title">Get more from every movie night.</h2>
        <p className="promo__sub">Everything you use today stays free. ArcTV Plus adds extras on top.</p>
        <ul className="promo__list">
          {BENEFITS.map((b) => (
            <li key={b.title} className="promo__item">
              <span className="promo__icon" aria-hidden="true">{b.icon}</span>
              <span>
                <span className="promo__itemtitle">{b.title}</span>
                <span className="promo__itemdetail">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="promo__actions">
          <Surface ref={first} className="promo__btn promo__btn--go" onClick={onGo}>
            Take me there <MdArrowForward />
          </Surface>
          <Surface className="promo__btn promo__btn--close" onClick={onClose} clickSound="back">
            Close
          </Surface>
        </div>
        <p className="promo__hint">Explore plans in Settings → ArcTV Plus</p>
        <Surface className="promo__never" onClick={onNever} clickSound="back">
          Don't show me again
        </Surface>
      </div>
    </div>
  );
}
