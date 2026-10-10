import { useEffect, useRef, useState, type ReactNode } from "react";
import { MdArrowForward, MdClose, MdFavorite, MdBarChart, MdBolt, MdDownload, MdGroups, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { usePlus } from "../../state/plus";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { promoDue, usePlusPromo } from "../../state/plusPromo";
import { usePlusWelcome, welcomeDue } from "../../state/plusWelcome";
import { MangoLogo } from "./Logo";
import { Surface } from "./Surface";

const SHOW_AFTER_MS = 4000;

const BENEFITS = [
  { icon: <MdFavorite />, title: "Picked for you", detail: "A Home row chosen from the movies and shows you like, with the reason under each poster." },
  { icon: <MdGroups />, title: "Up to 5 profiles", detail: "Their own My List, Continue Watching and recommendations. Add kids profiles and PIN locks." },
  { icon: <MdDownload />, title: "Downloads on the web and Mac", detail: "Save movies and episodes to your device from the web app or the Mac app, best quality at the smallest size first." },
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

export interface PromoContent {
  title: string;
  subtitle: string;
  benefits: Array<{ icon: ReactNode; title: string; detail: string }>;
  goLabel: string;
  hint: string;
}

const PLUS_INVITATION: PromoContent = {
  title: "Get more from every movie night.",
  subtitle: "Everything you use today stays free. ArcTV Plus adds extras on top.",
  benefits: BENEFITS,
  goLabel: "Take me there",
  hint: "Explore plans in Settings → ArcTV Plus",
};

/** The Plus popup's look, with its words passed in. Without `onNever` there is no "Don't show me again" link (a one-time announcement needs none). */
export function PromoDialog({ onClose, onNever, onGo, content = PLUS_INVITATION }: { onClose(): void; onNever?: () => void; onGo(): void; content?: PromoContent }) {
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
        <h2 id="promo-title" className="promo__title">{content.title}</h2>
        <p className="promo__sub">{content.subtitle}</p>
        <ul className="promo__list">
          {content.benefits.map((b) => (
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
            {content.goLabel} <MdArrowForward />
          </Surface>
          <Surface className="promo__btn promo__btn--close" onClick={onClose} clickSound="back">
            Close
          </Surface>
        </div>
        <p className="promo__hint">{content.hint}</p>
        {onNever ? (
          <Surface className="promo__never" onClick={onNever} clickSound="back">
            Don't show me again
          </Surface>
        ) : null}
      </div>
    </div>
  );
}

export const PLUS_FEATURES: PromoContent = {
  title: "Everything in ArcTV Plus.",
  subtitle: "Here is what your Plus membership gives you.",
  benefits: [
    { icon: <MdFavorite />, title: "Picked for you", detail: "A Home row chosen from the movies and shows you like, with the reason under each poster. Tune it in Settings → Recommendations." },
    { icon: <MdGroups />, title: "Up to 5 profiles", detail: "Their own My List, Continue Watching and recommendations. Add kids profiles and PIN locks." },
    { icon: <MdBolt />, title: "Smart source picking", detail: "Skips the source list and starts the best source your device can play." },
    { icon: <MdBarChart />, title: "Your stats", detail: "How much you watch, your streak and a map of your last 13 weeks." },
    { icon: <MdDownload />, title: "Downloads (web and Mac)", detail: "Save movies and episodes to your device from the Download button on a details page." },
  ],
  goLabel: "See my Plus settings",
  hint: "Parental controls are on the way",
};

/**
 * A one-time tour of what ArcTV Plus includes, for members, a few seconds after landing on Home. Close or "See my Plus settings" both
 * mean it has been seen, and it does not come back (a revised tour gets a new id). Not for kids profiles.
 */
export function PlusWelcome({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const hasPlus = usePlus((s) => s.active);
  const adult = useProfiles((s) => !(s.plus && activeProfileOf(s)?.kind === "kids"));
  const ready = usePlusWelcome((s) => s.userId !== null && welcomeDue(s));
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const eligible = enabled && signedIn && hasPlus && adult && ready;

  useEffect(() => {
    if (!eligible) return undefined;
    const timer = window.setTimeout(() => {
      usePlusWelcome.getState().markShown();
      setOpen(true);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!open || !enabled || !hasPlus) return null;

  const close = () => {
    setOpen(false);
    usePlusWelcome.getState().markSeen();
  };
  const go = () => {
    close();
    navigate(routes.settings("plus-settings"));
  };
  return <PromoDialog onClose={close} onGo={go} content={PLUS_FEATURES} />;
}
