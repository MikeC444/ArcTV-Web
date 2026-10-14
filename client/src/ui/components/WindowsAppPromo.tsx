import { useEffect, useState } from "react";
import { MdComputer, MdDownload, MdSync } from "react-icons/md";
import { fetchWindowsInstallerUrl, onWindows, WINDOWS_APP_URL } from "../../lib/windows";
import { useAuth } from "../../state/auth";
import { windowsAppDue, useWindowsApp } from "../../state/windowsApp";
import { reportAppPromoEvent } from "../../state/appPromoEvents";
import { PromoDialog, type PromoContent } from "./PlusPromo";

const SHOW_AFTER_MS = 4000;
/** How often to look again while another popup (the Plus ones) is still open, so two never stack. */
const RETRY_MS = 2000;

export const WINDOWS_APP_INVITATION: PromoContent = {
  badge: "WINDOWS",
  title: "Arc TV is on your PC.",
  subtitle: "Get the Windows app for a faster, native way to watch, with the account you already use.",
  benefits: [
    { icon: <MdComputer />, title: "Made for Windows", detail: "A native app with its own player, so no browser tab is needed." },
    { icon: <MdSync />, title: "Everything follows you", detail: "Your My List, Continue Watching and addons are there as soon as you sign in." },
    { icon: <MdDownload />, title: "Downloads", detail: "Save movies and episodes to your PC with ArcTV Plus." },
  ],
  goLabel: "Get the Windows app",
  hint: "Free to download. Windows may ask you to confirm before it runs (the app isn't code-signed yet).",
};

const anotherDialogOpen = () => document.querySelector('[role="dialog"]') !== null;

/**
 * A one-time invitation to the Windows app, for a signed-in person on a Windows browser, a few seconds after landing on Home (and after any
 * Plus popup has been dealt with). "Get the Windows app" starts downloading the newest installer (the release page if it can't be found).
 * Close or the button both mean it has been seen, and it does not come back for that account.
 */
export function WindowsAppPromo({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const ready = useWindowsApp((s) => s.userId !== null && windowsAppDue(s));
  const [open, setOpen] = useState(false);
  const [installerUrl, setInstallerUrl] = useState<string | null>(null);
  const eligible = enabled && signedIn && ready && onWindows();

  useEffect(() => {
    if (!eligible) return undefined;
    let timer = window.setTimeout(function show() {
      if (anotherDialogOpen()) {
        timer = window.setTimeout(show, RETRY_MS);
        return;
      }
      useWindowsApp.getState().markShown();
      setOpen(true);
      reportAppPromoEvent({ app: "windows", kind: "shown" });
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  // Find the newest installer as soon as the popup is up, so the button can start the download in the same click.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void fetchWindowsInstallerUrl().then((url) => {
      if (!cancelled) setInstallerUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !enabled) return null;

  const close = () => {
    setOpen(false);
    useWindowsApp.getState().markSeen();
  };
  /** Closed without taking the app (the close button, Escape or a click outside). */
  const dismiss = () => {
    close();
    reportAppPromoEvent({ app: "windows", kind: "closed" });
  };
  const go = () => {
    close();
    reportAppPromoEvent({ app: "windows", kind: "download" });
    if (installerUrl) {
      const link = document.createElement("a");
      link.href = installerUrl;
      link.rel = "noopener";
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(WINDOWS_APP_URL, "_blank", "noopener");
    }
  };
  return <PromoDialog onClose={dismiss} onGo={go} content={WINDOWS_APP_INVITATION} />;
}
