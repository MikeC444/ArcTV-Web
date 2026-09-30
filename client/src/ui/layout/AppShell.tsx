import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getModality } from "../../lib/modality";
import { useScrollMemory } from "../../lib/scrollMemory";
import { CardActionsMenu } from "../components/CardActionsMenu";
import { OfflineBanner } from "../components/OfflineBanner";
import { TopNav } from "../components/TopNav";

/** Moves focus to the primary control of a freshly opened screen — but only for keyboard/remote-style users. */
function useRouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (getModality() !== "keyboard") return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>('[data-autofocus="true"]') ?? document.querySelector<HTMLElement>('.navitem[data-selected="true"]');
      target?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);
}

export function AppShell() {
  const { pathname } = useLocation();
  useRouteFocus();
  useScrollMemory();
  const overHero = pathname === "/" || pathname.startsWith("/detail");
  const fullScreen = pathname.startsWith("/sources"); // like the TV's SourcesScreen: its own back arrow, no top navigation
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {fullScreen ? null : <TopNav transparent={overHero} />}
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
      <OfflineBanner />
      <CardActionsMenu />
    </>
  );
}
