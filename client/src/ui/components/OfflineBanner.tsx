import { useEffect, useState } from "react";
import { MdWifiOff } from "react-icons/md";

/** Offline mode (Milestone 13): everything renders from the local cache; changes queue and sync when back online. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <MdWifiOff aria-hidden="true" /> You're offline — your library is available and changes will sync when you're back online.
    </div>
  );
}
