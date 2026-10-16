import { useEffect, useRef, useState, type ReactNode } from "react";
import { MdArrowForward, MdClose, MdFavorite, MdBarChart, MdBolt, MdDownload, MdGroups, MdThumbUp, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { usePlus } from "../../state/plus";
import { usePlusInvite, type PlusInviteKind } from "../../state/plusInvite";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { promoDue, usePlusPromo } from "../../state/plusPromo";
import { usePlusWelcome, welcomeDue } from "../../state/plusWelcome";
import { ArcLogo } from "./Logo";
import { Surface } from "./Surface";

const SHOW_AFTER_MS = 4000;

const BENEFITS = [
  { icon: <MdFavorite />, title: "Picked for you", detail: "A Home row chosen from the movies and shows you like, with the reason under each poster." },
  { icon: <MdGroups />, title: "Up to 5 profiles", detail: "Their own My List, Continue Watching and recommendations. Add kids profiles and PIN locks." },
  { icon: <MdDownload />, title: "Downloads on the web, Mac and Windows", detail: "Save movies and episodes to your device from the web app, the Mac app or the Windows app, best quality at the smallest size first." },
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
  /** The little badge by the logo; "PLUS" when not given. */
  badge?: string;
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

/** The Plus popup shown when someone without Plus presses a Download button: the usual invitation with Downloads first. */
export const DOWNLOAD_INVITATION: PromoContent = {
  title: "Downloads come with ArcTV Plus.",
  subtitle: "Save movies and episodes to your device. Everything you use today stays free.",
  benefits: [BENEFITS[2]!, BENEFITS[0]!, BENEFITS[1]!, BENEFITS[3]!],
  goLabel: "Take me there",
  hint: "Explore plans in Settings → ArcTV Plus",
};

/** The popup for someone who pressed Like or "Not for me" without Plus: Picked for you first, because that is what their taste feeds. */
export const PICKED_INVITATION: PromoContent = {
  title: "Tell ArcTV what you like.",
  subtitle: "With ArcTV Plus, Like and Not for me shape a Home row picked for you. Everything you use today stays free.",
  benefits: [BENEFITS[0]!, { icon: <MdThumbUp />, title: "Like and Not for me", detail: "On every movie and show, so your picks get better the more you use them." }, BENEFITS[1]!, BENEFITS[3]!],
  goLabel: "Take me there",
  hint: "Explore plans in Settings → ArcTV Plus",
};

/** The popup for someone who pressed Add profile without Plus. */
export const PROFILES_INVITATION: PromoContent = {
  title: "Give everyone their own profile.",
  subtitle: "ArcTV Plus adds up to 5 profiles on one account. Everything you use today stays free.",
  benefits: [BENEFITS[1]!, BENEFITS[0]!, BENEFITS[2]!, BENEFITS[3]!],
  goLabel: "Take me there",
  hint: "Explore plans in Settings → ArcTV Plus",
};

/** The popup for someone who wants the full Your stats without Plus. */
export const STATS_INVITATION: PromoContent = {
  title: "See your whole watching story.",
  subtitle: "ArcTV Plus unlocks your full stats: weekly changes, your busiest day and a map of the last 13 weeks.",
  benefits: [{ icon: <MdBarChart />, title: "Your stats", detail: "How much you watch, how this week compares, your streak and a map of your last 13 weeks." }, BENEFITS[0]!, BENEFITS[1]!, BENEFITS[3]!],
  goLabel: "Take me there",
  hint: "Explore plans in Settings → ArcTV Plus",
};

const INVITATIONS: Record<PlusInviteKind, PromoContent> = { picked: PICKED_INVITATION, profiles: PROFILES_INVITATION, stats: STATS_INVITATION };

/** Draws the Plus invitation a locked feature asked for (see `usePlusInvite`), and takes "Take me there" to the Plus tab. */
export function PlusInviteHost() {
  const kind = usePlusInvite((s) => s.kind);
  const navigate = useNavigate();
  if (!kind) return null;
  const close = () => usePlusInvite.getState().close();
  return (
    <PromoDialog
      content={INVITATIONS[kind]}
      onClose={close}
      onGo={() => {
        close();
        navigate(routes.settings("plus"));
      }}
    />
  );
}

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
          <ArcLogo size={26} />
          <span className="promo__plus">{content.badge ?? "PLUS"}</span>
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
    { icon: <MdDownload />, title: "Downloads (web, Mac and Windows)", detail: "Save movies and episodes to your device from the Download button on a details page." },
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
