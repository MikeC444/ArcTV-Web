import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MdCategory, MdHome, MdMovie, MdOutlineBookmarkBorder, MdSearch, MdSettings, MdTv } from "react-icons/md";
import { NAV_ITEMS, routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { MangoLogo } from "./Logo";
import { Surface } from "./Surface";

/** Which nav item a path belongs to (Detail counts as Home, like the TV app). */
export function selectedNavIndex(pathname: string): number {
  if (pathname === "/" || pathname.startsWith("/detail")) return 0;
  const found = NAV_ITEMS.findIndex((item, i) => i > 0 && (pathname === item.to || pathname.startsWith(`${item.to}/`)));
  return found < 0 ? 0 : found;
}

/** Phones get a bottom tab bar (like the big streaming apps) instead of the scrolling text links; Settings moves to a gear beside the logo. */
const TABS = [
  { label: "Home", to: "/", icon: MdHome },
  { label: "Movies", to: "/movies", icon: MdMovie },
  { label: "TV Shows", to: "/tv", icon: MdTv },
  { label: "Genres", to: "/genres", icon: MdCategory },
  { label: "Search", to: "/search", icon: MdSearch },
  { label: "My List", to: "/my-list", icon: MdOutlineBookmarkBorder },
] as const;

/** ui/home/TopNavBar.kt — logo + scrolling nav items over a fade scrim (translucent over Home's hero). */
export function TopNav({ transparent = false }: { transparent?: boolean }) {
  const { pathname } = useLocation();
  const selected = selectedNavIndex(pathname);
  // The bar slides away while scrolling down and comes back on scroll up (or at the top) (or when it takes keyboard / remote focus).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 40) setScrolled(false);
      else if (y > last + 4) setScrolled(true); // scrolling down hides the bar
      else if (y < last - 4) setScrolled(false); // scrolling up brings it back
      last = y;
    };
    // Moving the mouse up to where the bar was brings it back.
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 60) setScrolled(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
    };
  }, [pathname]);
  const guest = useAuth((s) => s.status !== "signedIn");
  // Without an account the Settings link becomes "Sign In" (and Settings itself is unreachable).
  const items = guest ? NAV_ITEMS.map((item) => (item.to === "/settings" ? { label: "Sign In", to: routes.auth } : item)) : NAV_ITEMS;
  return (
    <header className="topnav" data-transparent={transparent} data-scrolled={scrolled} role="banner">
      <Link to="/" className="topnav__logo tvs" aria-label="Mango TV — Home" style={{ ["--tvs-radius" as string]: "6px", ["--tvs-border" as string]: "var(--text)" }}>
        <MangoLogo size="1em" />
      </Link>
      <nav className="topnav__items hide-scroll" aria-label="Primary">
        {items.map((item, index) => (
          <Surface key={item.label} to={item.to} className="navitem" instantBorder noShadow borderColor="var(--text)" ariaCurrent={index === selected ? "page" : undefined} dataAttrs={{ selected: index === selected }}>
            {item.label}
          </Surface>
        ))}
      </nav>
      {guest ? (
        <Link to={routes.auth} state={{ from: pathname }} className="topnav__signin">
          Sign In
        </Link>
      ) : (
        <Link to="/settings" className="topnav__gear" aria-label="Settings" aria-current={selected === NAV_ITEMS.length - 1 ? "page" : undefined}>
          <MdSettings aria-hidden="true" />
        </Link>
      )}
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((tab) => {
          const active = NAV_ITEMS[selected]?.to === tab.to;
          return (
            <Link key={tab.label} to={tab.to} className="tabbar__item" aria-current={active ? "page" : undefined} data-selected={active}>
              <tab.icon aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
