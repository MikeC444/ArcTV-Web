import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MdAnimation, MdHome, MdLiveTv, MdMovie, MdOutlineBookmarkBorder, MdSearch, MdSettings, MdTv } from "react-icons/md";
import { isDetailPath, NAV_ITEMS, navItems, routes } from "../../lib/routes";
import { useHasAnime, useHasLiveTv } from "../../state/hooks";
import { useAuth } from "../../state/auth";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { ProfileAvatar } from "./ProfileAvatar";
import { ArcLogo } from "./Logo";
import { Surface } from "./Surface";

/** Which nav item a path belongs to (Detail counts as Home, like the TV app). */
export function selectedNavIndex(pathname: string, items: ReadonlyArray<{ readonly to: string }> = NAV_ITEMS): number {
  if (pathname === "/" || isDetailPath(pathname)) return 0;
  const found = items.findIndex((item, i) => i > 0 && (pathname === item.to || pathname.startsWith(`${item.to}/`)));
  return found < 0 ? 0 : found;
}

/** Phones get a bottom tab bar (like the big streaming apps) instead of the scrolling text links; Settings moves to a gear beside the logo. */
const TABS = [
  { label: "Home", to: "/", icon: MdHome },
  { label: "Movies", to: "/movies", icon: MdMovie },
  { label: "TV Shows", to: "/tv", icon: MdTv },
  { label: "Search", to: "/search", icon: MdSearch },
  { label: "My List", to: "/my-list", icon: MdOutlineBookmarkBorder },
] as const;

const ANIME_TAB = { label: "Anime", to: "/anime", icon: MdAnimation } as const;
const LIVE_TAB = { label: "Live TV", to: "/live", icon: MdLiveTv } as const;

/** ui/home/TopNavBar.kt — logo + scrolling nav items over a fade scrim (translucent over Home's hero). */
export function TopNav({ transparent = false }: { transparent?: boolean }) {
  const { pathname } = useLocation();
  const hasAnime = useHasAnime();
  const hasLiveTv = useHasLiveTv();
  const navList = navItems(hasAnime, hasLiveTv);
  const selected = selectedNavIndex(pathname, navList);
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
  // A kids profile has no Settings (addons, sign-out and the Plus page stay with the adults): its nav ends at My List.
  // Everyone sees who is watching; without Plus that is the account's own profile, and the chip opens the Profiles screen where more can be added.
  const profile = useProfiles((s) => (s.supported ? activeProfileOf(s) : undefined));
  const kids = profile?.kind === "kids";
  const items = guest ? navList.map((item) => (item.to === "/settings" ? { label: "Sign In", to: routes.auth } : item)) : kids ? navList.filter((item) => item.to !== "/settings" && item.to !== "/live") : navList;
  return (
    <header className="topnav" data-transparent={transparent} data-scrolled={scrolled} role="banner">
      <Link to="/" className="topnav__logo tvs" aria-label="Arc TV — Home" style={{ ["--tvs-radius" as string]: "6px", ["--tvs-border" as string]: "var(--text)" }}>
        <ArcLogo size="1em" />
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
      ) : kids ? null : (
        <Link to="/settings" className="topnav__gear" aria-label="Settings" aria-current={navList[selected]?.to === "/settings" ? "page" : undefined}>
          <MdSettings aria-hidden="true" />
        </Link>
      )}
      {!guest && profile ? (
        <Link to={routes.profiles} state={{ from: pathname }} className="topnav__profile" aria-label={`${profile.name} — switch profile`} title="Switch profile">
          <span className="topnav__profileavatar">
            <ProfileAvatar avatar={profile.avatar} />
          </span>
          <span className="topnav__profilename">{profile.name}</span>
        </Link>
      ) : null}
      <nav className="tabbar" aria-label="Primary">
        {[...TABS.slice(0, 3), ...(hasAnime ? [ANIME_TAB] : []), ...(hasLiveTv && !kids ? [LIVE_TAB] : []), ...TABS.slice(3)].map((tab) => {
          const active = navList[selected]?.to === tab.to;
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
