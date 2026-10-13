/**
 * Features that are built but not switched on. Turning one on is a one-word change here (and a redeploy); the code, its tests and its
 * server side all stay in place meanwhile.
 *  · liveTv: the Live TV tab, its player and the TV guide (ui/screens/LiveTv.tsx, LivePlayer.tsx, LiveGuide.tsx, domain/live.ts, domain/epg.ts).
 *    Off for now: no tab, and the addresses /live and /live/watch/… are not found. The server's /api/epg routes only answer when asked, and
 *    nothing asks while this is off.
 */
export const FEATURES = {
  liveTv: false,
};
