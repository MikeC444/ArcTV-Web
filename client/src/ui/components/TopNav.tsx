import { Link, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../../lib/routes";
import { MangoLogo } from "./Logo";
import { Surface } from "./Surface";

/** Which nav item a path belongs to (Detail counts as Home, like the TV app). */
export function selectedNavIndex(pathname: string): number {
  if (pathname === "/" || pathname.startsWith("/detail")) return 0;
  const found = NAV_ITEMS.findIndex((item, i) => i > 0 && (pathname === item.to || pathname.startsWith(`${item.to}/`)));
  return found < 0 ? 0 : found;
}

/** ui/home/TopNavBar.kt — logo + scrolling nav items over a fade scrim (translucent over Home's hero). */
export function TopNav({ transparent = false }: { transparent?: boolean }) {
  const { pathname } = useLocation();
  const selected = selectedNavIndex(pathname);
  return (
    <header className="topnav" data-transparent={transparent} role="banner">
      <Link to="/" className="topnav__logo tvs" aria-label="Mango TV — Home" style={{ ["--tvs-radius" as string]: "6px", ["--tvs-border" as string]: "var(--text)" }}>
        <MangoLogo />
      </Link>
      <nav className="topnav__items hide-scroll" aria-label="Primary">
        {NAV_ITEMS.map((item, index) => (
          <Surface key={item.label} to={item.to} className="navitem" instantBorder noShadow borderColor="var(--text)" ariaCurrent={index === selected ? "page" : undefined} dataAttrs={{ selected: index === selected }}>
            {item.label}
          </Surface>
        ))}
      </nav>
    </header>
  );
}
