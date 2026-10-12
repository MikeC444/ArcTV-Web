import { useEffect, useState } from "react";
import { MdDownload, MdLaptopMac, MdSync } from "react-icons/md";
import { MAC_APP_URL, onMac } from "../../lib/mac";
import { useAuth } from "../../state/auth";
import { macAppDue, useMacApp } from "../../state/macApp";
import { PromoDialog, type PromoContent } from "./PlusPromo";

const SHOW_AFTER_MS = 4000;
/** How often to look again while another popup (the Plus ones) is still open, so two never stack. */
const RETRY_MS = 2000;

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

const anotherDialogOpen = () => document.querySelector('[role="dialog"]') !== null;

/**
 * A one-time invitation to the Mac app, for a signed-in person on a Mac browser, a few seconds after landing on Home (and after any
 * Plus popup has been dealt with). Close or "Get the Mac app" both mean it has been seen, and it does not come back for that account.
 */
export function MacAppPromo({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const ready = useMacApp((s) => s.userId !== null && macAppDue(s));
  const [open, setOpen] = useState(false);
  const eligible = enabled && signedIn && ready && onMac();

  useEffect(() => {
    if (!eligible) return undefined;
    let timer = window.setTimeout(function show() {
      if (anotherDialogOpen()) {
        timer = window.setTimeout(show, RETRY_MS);
        return;
      }
      useMacApp.getState().markShown();
      setOpen(true);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!open || !enabled) return null;

  const close = () => {
    setOpen(false);
    useMacApp.getState().markSeen();
  };
  const go = () => {
    close();
    window.open(MAC_APP_URL, "_blank", "noopener");
  };
  return <PromoDialog onClose={close} onGo={go} content={MAC_APP_INVITATION} />;
}
