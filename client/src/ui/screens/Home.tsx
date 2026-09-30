import { useEffect, useRef, useState } from "react";
import { MdAdd, MdCheck, MdInfo, MdPlayArrow } from "react-icons/md";
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
const HERO_CROSSFADE_MS = 900;

/** ui/home/HeroSection.kt — rotating full-bleed featured title with Ken-Burns backdrop and Play / + / Info. */
function Hero({ items }: { items: Content[] }) {
  const navigate = useNavigate();
  const saved = useSavedIds();
  const toggle = useMyList((s) => s.toggle);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const lastIndex = useRef(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        lastIndex.current = current;
        setPrevious(current);
        return (current + 1) % items.length;
      });
    }, HERO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [items]);
  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setPrevious(null), HERO_CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [previous]);

  const current = items[index % items.length];
  if (!current) return null;
  const providerId = current.providerId;
  const isSaved = saved.has(current.id);
  const meta = [current.year, current.ageRating, current.runtimeMinutes ? formatRuntime(current.runtimeMinutes) : null, current.rating != null ? `★ ${current.rating.toFixed(1)}` : null].filter(Boolean);
  const backdrop = (item: Content, fading: "in" | "out" | null) => (
    <div key={`${item.id}-${fading}`} className="hero__layer" data-fade={fading ?? undefined}>
      {item.backdropUrl ? <img src={item.backdropUrl} alt="" referrerPolicy="no-referrer" data-loaded={loaded[item.id] ? "true" : "false"} onLoad={() => setLoaded((l) => ({ ...l, [item.id]: true }))} /> : null}
    </div>
  );

  return (
    <section className="hero" aria-label="Featured">
      {previous !== null && items[previous] ? backdrop(items[previous]!, "out") : null}
      {backdrop(current, previous !== null ? "in" : null)}
      <div className="hero__scrim-x" />
      <div className="hero__scrim-y" />
      <div className="hero__content">
        {current.logoUrl ? <img className="hero__logo" src={current.logoUrl} alt={current.title} referrerPolicy="no-referrer" /> : <h1 className="t-display-md hero-shadow clamp-2">{current.title}</h1>}
        {meta.length ? <p className="hero__meta hero-shadow">{meta.join("   •   ")}</p> : null}
        {current.genres.length ? <p className="hero__genres hero-shadow">{current.genres.map((g) => g.name).join("  ·  ")}</p> : null}
        {current.description ? <p className="hero__desc hero-shadow clamp-3">{current.description}</p> : null}
        <div className="hero__actions">
          <MangoButton text="Play" icon={<MdPlayArrow />} variant="light" dataAttrs={{ autofocus: true }} onClick={() => providerId && navigate(routes.sources(providerId, current.type, current.id))} />
          <IconButton icon={isSaved ? <MdCheck /> : <MdAdd />} label={isSaved ? "Remove from My List" : "Add to My List"} onClick={() => toggle(current)} />
          <IconButton
            icon={<MdInfo />}
            label="More Info"
            onClick={() => {
              if (!providerId) return;
              stashDetailPreview(current);
              navigate(routes.detail(providerId, current.type, current.id));
            }}
          />
        </div>
      </div>
      {items.length > 1 ? (
        <div className="hero__dots" aria-hidden="true">
          {items.map((c, i) => (
            <span key={c.id} data-active={i === index} />
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
          <ContentRow key={section.id} section={section} scale={0.75} />
        ))}
      </div>
    </div>
  );
}
