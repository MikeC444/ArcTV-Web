import { useEffect, useRef, useState } from "react";
import { MdAdd, MdCheck, MdInfo, MdPause, MdPlayArrow } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import type { Content } from "../../domain/types";
import { formatRuntime } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useHome } from "../../state/homeData";
import { useSavedIds } from "../../state/hooks";
import { useMyList } from "../../state/myList";
import { stashDetailPreview } from "../../state/pendingDetail";
import { MangoButton, IconButton } from "../components/Buttons";
import { ContentRow } from "../components/ContentRow";
import { HomeSkeleton } from "../components/Skeletons";
import { FullScreenError, HomeEmptyState } from "../components/States";

const HERO_ROTATE_MS = 9000;
const HERO_SLIDE_MS = 650;

/** The next title slides in from the right (and the old one out to the left); picking an EARLIER title with the dots slides the other way. */
type Leaving = { index: number; dir: "next" | "prev" };

/** ui/home/HeroSection.kt — rotating full-bleed featured title with Ken-Burns backdrop and Play / + / Info. The dots at the bottom jump to a title. */
function Hero({ items }: { items: Content[] }) {
  const navigate = useNavigate();
  const saved = useSavedIds();
  const toggle = useMyList((s) => s.toggle);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  // The slide show moves by itself, so it must be stoppable (WCAG 2.2.2): a pause button, and it also waits while the pointer or keyboard focus
  // is inside the hero. People who ask their device for reduced motion start paused.
  const [paused, setPaused] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const [engaged, setEngaged] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const goTo = (target: number, direction: "next" | "prev") => {
    if (items.length < 2 || target === index) return;
    setLeaving({ index, dir: direction });
    setDir(direction);
    setIndex(target);
  };

  // advance every few seconds; any change of title (automatic or from the dots) restarts the wait
  useEffect(() => {
    if (items.length <= 1 || paused || engaged) return;
    const timer = window.setTimeout(() => goTo((index + 1) % items.length, "next"), HERO_ROTATE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, index, paused, engaged]);
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), HERO_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const current = items[index % items.length];
  if (!current) return null;

  const slide = (item: Content, anim: string | undefined, isCurrent: boolean) => {
    const providerId = item.providerId;
    const isSaved = saved.has(item.id);
    const meta = [item.year, item.ageRating, item.runtimeMinutes ? formatRuntime(item.runtimeMinutes) : null, item.rating != null ? `★ ${item.rating.toFixed(1)}` : null].filter(Boolean);
    // the slide on its way out is only a picture: hidden from assistive tech and not interactive
    const passive = isCurrent ? {} : ({ "aria-hidden": true, inert: "" } as Record<string, unknown>);
    return (
      <div key={isCurrent ? item.id : `${item.id}-leaving`} className="hero__slide" data-anim={anim} {...passive}>
        <div className="hero__layer">
          {item.backdropUrl ? <img src={item.backdropUrl} alt="" referrerPolicy="no-referrer" data-loaded={loaded[item.id] ? "true" : "false"} onLoad={() => setLoaded((l) => ({ ...l, [item.id]: true }))} /> : null}
        </div>
        <div className="hero__scrim-x" />
        <div className="hero__scrim-y" />
        <div className="hero__content">
          {item.logoUrl ? (
            <h1 className="hero__title">
              <img className="hero__logo" src={item.logoUrl} alt={item.title} referrerPolicy="no-referrer" />
            </h1>
          ) : (
            <h1 className="t-display-md hero-shadow clamp-2">{item.title}</h1>
          )}
          {meta.length ? <p className="hero__meta hero-shadow">{meta.join("   •   ")}</p> : null}
          {item.genres.length ? <p className="hero__genres hero-shadow">{item.genres.map((g) => g.name).join("  ·  ")}</p> : null}
          {item.description ? <p className="hero__desc hero-shadow clamp-3">{item.description}</p> : null}
          <div className="hero__actions">
            <MangoButton text="Play" icon={<MdPlayArrow />} variant="light" dataAttrs={isCurrent ? { autofocus: true } : undefined} onClick={() => providerId && navigate(routes.sources(providerId, item.type, item.id))} />
            <IconButton icon={isSaved ? <MdCheck /> : <MdAdd />} label={isSaved ? "Remove from My List" : "Add to My List"} onClick={() => toggle(item)} />
            <IconButton
              icon={<MdInfo />}
              label="More Info"
              onClick={() => {
                if (!providerId) return;
                stashDetailPreview(item);
                navigate(routes.detail(providerId, item.type, item.id));
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  const leavingItem = leaving ? items[leaving.index] : undefined;
  return (
    <section
      className="hero"
      aria-label="Featured"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setEngaged(false)}
      // swipe left / right to change title (the dots are small targets on a phone)
      onTouchStart={(event) => {
        const t = event.touches[0];
        swipe.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const from = swipe.current;
        const t = event.changedTouches[0];
        swipe.current = null;
        if (!from || !t || items.length < 2) return;
        const dx = t.clientX - from.x;
        if (Math.abs(dx) < 50 || Math.abs(t.clientY - from.y) > 40) return;
        if (dx < 0) goTo((index + 1) % items.length, "next");
        else goTo((index - 1 + items.length) % items.length, "prev");
      }}
    >
      {leaving && leavingItem ? slide(leavingItem, `out-${leaving.dir}`, false) : null}
      {slide(current, leaving ? `in-${dir}` : undefined, true)}
      {items.length > 1 ? (
        <div className="hero__dots" role="group" aria-label="Featured titles">
          <button type="button" className="hero__pause" aria-label={paused ? "Start the automatic slide show" : "Pause the automatic slide show"} onClick={() => setPaused((p) => !p)}>
            {paused ? <MdPlayArrow aria-hidden="true" /> : <MdPause aria-hidden="true" />}
          </button>
          {items.map((c, i) => (
            <button key={c.id} type="button" className="hero__dot" data-active={i === index} aria-label={`Show ${c.title}, ${i + 1} of ${items.length}`} aria-current={i === index ? "true" : undefined} onClick={() => goTo(i, i < index ? "prev" : "next")} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function Home() {
  const { state, reload } = useHome();
  useEffect(() => {
    document.title = "Mango TV";
  }, []);

  if (state.kind === "loading") return <HomeSkeleton />;
  if (state.kind === "error") return <FullScreenError message={state.message} onRetry={reload} />;
  if (state.kind === "empty") return <div style={{ paddingTop: "var(--nav-h)" }}><HomeEmptyState /></div>;
  return (
    <div className="home">
      <Hero items={state.hero} />
      <div className="home__rows">
        {state.sections.map((section) => (
          <ContentRow key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
