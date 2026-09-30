import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getModality } from "../../lib/modality";
import { CardActionsMenu } from "../components/CardActionsMenu";
import { OfflineBanner } from "../components/OfflineBanner";
import { TopNav } from "../components/TopNav";

/** Moves focus to the primary control of a freshly opened screen — but only for keyboard/remote-style users. */
function useRouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (getModality() !== "keyboard") return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>("[data-autofocus]") ?? document.querySelector<HTMLElement>('.navitem[data-selected="true"]');
      target?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);
}

export function AppShell() {
  const { pathname } = useLocation();
  useRouteFocus();
  const overHero = pathname === "/" || pathname.startsWith("/detail");
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopNav transparent={overHero} />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
      <OfflineBanner />
      <CardActionsMenu />
    </>
  );
}
