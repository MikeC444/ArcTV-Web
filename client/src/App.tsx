import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { installModalityTracking } from "./lib/modality";
import { installSpatialNavigation } from "./lib/spatialNav";
import { routes } from "./lib/routes";
import { useAuth } from "./state/auth";
import { activeProfileOf, needsProfilePicker, useProfiles } from "./state/profiles";
import { detachSession, startGuestSession, startSession } from "./state/sync";
import { AppShell } from "./ui/layout/AppShell";
import { Spinner } from "./ui/components/States";
import { AddAddonScreen, SettingsScreen } from "./ui/screens/Settings";
import { AllowGuests, AuthLayout, AuthMethodScreen, AuthStartScreen, PasswordSignInScreen, QrSignInScreen, RequireAuth } from "./ui/screens/Auth";
import { MoviesScreen, MyListScreen, TvShowsScreen } from "./ui/screens/Browse";
import { DebridGuideScreen } from "./ui/screens/DebridGuide";
import { DetailScreen } from "./ui/screens/Detail";
import { Home } from "./ui/screens/Home";
import { ProfilesScreen } from "./ui/screens/Profiles";
import { SearchScreen } from "./ui/screens/Search";
import { SourcesScreen } from "./ui/screens/Sources";

// The player pulls in hls.js / dash.js — only load them when someone actually presses Play.
const AdminScreen = lazy(() => import("./ui/screens/Admin").then((m) => ({ default: m.AdminScreen })));
const PlayerScreen = lazy(() => import("./ui/screens/Player").then((m) => ({ default: m.PlayerScreen })));

/** Owns the data lifecycle: start syncing when a session exists, detach the stores when it ends. */
function SessionLifecycle() {
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (status === "signedIn" && userId) {
      void startSession(userId);
      return () => detachSession();
    }
    // no account: browse with the default addon (offline = no session could be confirmed, treated the same)
    if (status === "signedOut" || status === "offline") startGuestSession();
    return undefined;
  }, [status, userId]);
  return null;
}

/** Plus accounts with more than one profile start each visit at "Who's watching?", then land where they were heading. */
function ProfileGate() {
  const status = useAuth((s) => s.status);
  const needsPicker = useProfiles(needsProfilePicker);
  const { pathname, search } = useLocation();
  if (status === "signedIn" && needsPicker && pathname !== routes.profiles) return <Navigate to={routes.profiles} replace state={{ from: pathname + search }} />;
  return null;
}

/** A kids profile has no Settings: addons, signing out and the Plus page are for the adults. */
function RequireAdult({ children }: { children: React.ReactNode }) {
  const kids = useProfiles((s) => s.plus && activeProfileOf(s)?.kind === "kids");
  return kids ? <Navigate to="/" replace /> : <>{children}</>;
}

/** The developer panel: only for an account flagged as an admin (the backend checks too; this just hides the page). */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAdmin = useAuth((s) => s.user?.isAdmin === true);
  return isAdmin ? <>{children}</> : <NotFound />;
}

function NotFound() {
  return (
    <div className="state" style={{ paddingTop: "var(--nav-h)" }}>
      <h1 className="state__title">Page not found</h1>
      <p className="state__msg">That page doesn't exist.</p>
    </div>
  );
}

export function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => {
    const removeModality = installModalityTracking();
    const removeNav = installSpatialNavigation();
    void init();
    return () => {
      removeModality();
      removeNav();
    };
  }, [init]);

  return (
    <BrowserRouter>
      <SessionLifecycle />
      <ProfileGate />
      <Routes>
        <Route path="profiles" element={<RequireAuth><ProfilesScreen /></RequireAuth>} />
        <Route element={<AuthLayout />}>
          <Route path="/auth" element={<AuthStartScreen />} />
          <Route path="/auth/method/:intent" element={<AuthMethodScreen />} />
          <Route path="/auth/password/:intent" element={<PasswordSignInScreen />} />
          <Route path="/auth/qr/:intent" element={<QrSignInScreen />} />
        </Route>
        <Route
          element={
            <AllowGuests>
              <AppShell />
            </AllowGuests>
          }
        >
          <Route index element={<Home />} />
          <Route path="movies" element={<MoviesScreen />} />
          <Route path="tv" element={<TvShowsScreen />} />
          <Route path="genres/*" element={<Navigate to="/movies" replace />} />
          <Route path="search" element={<SearchScreen />} />
          <Route path="my-list" element={<RequireAuth><MyListScreen /></RequireAuth>} />
          <Route path="settings" element={<RequireAuth><RequireAdult><SettingsScreen /></RequireAdult></RequireAuth>} />
          <Route path="settings/addons/add" element={<RequireAuth><RequireAdult><AddAddonScreen /></RequireAdult></RequireAuth>} />
          <Route path="settings/:tab" element={<RequireAuth><RequireAdult><SettingsScreen /></RequireAdult></RequireAuth>} />
          {/* Hidden for now: not linked from anywhere. Public, so the address can be shared. */}
          <Route path="guides/debrid" element={<DebridGuideScreen />} />
          <Route path="admin" element={<RequireAuth><RequireAdmin><Suspense fallback={<Spinner />}><AdminScreen /></Suspense></RequireAdmin></RequireAuth>} />
          <Route path="detail/:providerId/:type/:id" element={<DetailScreen />} />
          <Route path="movies/:slug" element={<DetailScreen kind="MOVIE" />} />
          <Route path="tv-shows/:slug" element={<DetailScreen kind="TV_SHOW" />} />
          <Route path="sources/:providerId/:type/:id/:season/:episode" element={<RequireAuth><SourcesScreen /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="/player/:providerId/:type/:id/:season/:episode/:streamId"
          element={
            <RequireAuth>
              <Suspense fallback={<div className="gate"><Spinner /></div>}>
                <PlayerScreen />
              </Suspense>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
