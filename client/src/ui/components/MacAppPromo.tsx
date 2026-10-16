import { useEffect, useState } from "react";
import { MdDownload, MdLaptopMac, MdSync } from "react-icons/md";
import { fetchMacDmgUrl, MAC_APP_URL, onMac } from "../../lib/mac";
import { useAuth } from "../../state/auth";
import { macAppDue, useMacApp } from "../../state/macApp";
import { reportAppPromoEvent } from "../../state/appPromoEvents";
import { APP_POPUP, useQueuedPopup } from "./popupQueue";
import { PromoDialog, type PromoContent } from "./PlusPromo";

export const MAC_APP_INVITATION: PromoContent = {
  badge: "MAC",
  title: "Arc TV is on your Mac.",
  subtitle: "Get the Mac app for a faster, native way to watch, with the account you already use.",
  benefits: [
    { icon: <MdLaptopMac />, title: "Made for your Mac", detail: "A native app with its own player, so no browser tab is needed." },
    { icon: <MdSync />, title: "Everything follows you", detail: "Your My List, Continue Watching and addons are there as soon as you sign in." },
    { icon: <MdDownload />, title: "Downloads", detail: "Save movies and episodes to your Mac with ArcTV Plus." },
  ],
  goLabel: "Get the Mac app",
  hint: "Free to download",
};

/**
 * A one-time invitation to the Mac app, for a signed-in person on a Mac browser, a few seconds after landing on Home (and after any
 * Plus popup has been dealt with). "Get the Mac app" starts downloading the newest disk image (the release page if it can't be found).
 * Close or the button both mean it has been seen, and it does not come back for that account.
 */
export function MacAppPromo({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const ready = useMacApp((s) => s.userId !== null && macAppDue(s));
  const [open, setOpen] = useState(false);
  const [dmgUrl, setDmgUrl] = useState<string | null>(null);
  const eligible = enabled && signedIn && ready && onMac();

  useQueuedPopup("mac-app", eligible, open, () => {
    useMacApp.getState().markShown();
    setOpen(true);
    reportAppPromoEvent({ app: "mac", kind: "shown" });
  }, APP_POPUP);

  // Find the newest disk image as soon as the popup is up, so the button can start the download in the same click.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void fetchMacDmgUrl().then((url) => {
      if (!cancelled) setDmgUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !enabled) return null;

  const close = () => {
    setOpen(false);
    useMacApp.getState().markSeen();
  };
  /** Closed without taking the app (the close button, Escape or a click outside). */
  const dismiss = () => {
    close();
    reportAppPromoEvent({ app: "mac", kind: "closed" });
  };
  const go = () => {
    close();
    reportAppPromoEvent({ app: "mac", kind: "download" });
    if (dmgUrl) {
      const link = document.createElement("a");
      link.href = dmgUrl;
      link.rel = "noopener";
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(MAC_APP_URL, "_blank", "noopener");
    }
  };
  return <PromoDialog onClose={dismiss} onGo={go} content={MAC_APP_INVITATION} />;
}
