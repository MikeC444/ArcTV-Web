import { useEffect, useState } from "react";
import { MdPhoneAndroid, MdSync, MdDownload } from "react-icons/md";
import { ANDROID_APP_URL, fetchAndroidApkUrl, onAndroidPhone } from "../../lib/androidApp";
import { useAuth } from "../../state/auth";
import { androidAppDue, useAndroidApp } from "../../state/androidApp";
import { APP_POPUP, useQueuedPopup } from "./popupQueue";
import { PromoDialog, type PromoContent } from "./PlusPromo";

export const ANDROID_APP_INVITATION: PromoContent = {
  badge: "ANDROID",
  title: "Arc TV is on Android.",
  subtitle: "Get the Android app for a smoother way to watch on your phone or tablet, with the account you already use.",
  benefits: [
    { icon: <MdPhoneAndroid />, title: "Made for your phone", detail: "A touch-friendly app with its own player, so no browser tab is needed." },
    { icon: <MdSync />, title: "Everything follows you", detail: "Your My List, Continue Watching and addons are there as soon as you sign in." },
    { icon: <MdDownload />, title: "Downloads", detail: "Save movies and episodes to your phone with ArcTV Plus." },
  ],
  goLabel: "Get the Android app",
  hint: "Free to download. Android will ask you to allow the install.",
};

/**
 * A one-time invitation to the Android app, for a signed-in person on an Android phone or tablet browser, a few seconds after landing on
 * Home (and after any Plus popup has been dealt with). "Get the Android app" starts downloading the newest app file (the release page if it
 * can't be found). Close or the button both mean it has been seen, and it does not come back for that account.
 */
export function AndroidAppPromo({ enabled }: { enabled: boolean }) {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const ready = useAndroidApp((s) => s.userId !== null && androidAppDue(s));
  const [open, setOpen] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const eligible = enabled && signedIn && ready && onAndroidPhone();

  useQueuedPopup("android-app", eligible, open, () => {
    useAndroidApp.getState().markShown();
    setOpen(true);
  }, APP_POPUP);

  // Find the newest app file as soon as the popup is up, so the button can start the download in the same click.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void fetchAndroidApkUrl().then((url) => {
      if (!cancelled) setApkUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !enabled) return null;

  const close = () => {
    setOpen(false);
    useAndroidApp.getState().markSeen();
  };
  const go = () => {
    close();
    if (apkUrl) {
      const link = document.createElement("a");
      link.href = apkUrl;
      link.rel = "noopener";
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(ANDROID_APP_URL, "_blank", "noopener");
    }
  };
  return <PromoDialog onClose={close} onGo={go} content={ANDROID_APP_INVITATION} />;
}
