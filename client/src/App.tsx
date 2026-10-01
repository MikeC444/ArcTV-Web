import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { installPlusPreviewFlag } from "./state/plusAccess";
import { installModalityTracking } from "./lib/modality";
import { installSpatialNavigation } from "./lib/spatialNav";
import { useAuth } from "./state/auth";
import { detachSession, startGuestSession, startSession } from "./state/sync";
import { AppShell } from "./ui/layout/AppShell";
import { Spinner } from "./ui/components/States";
import { AddAddonScreen, SettingsScreen } from "./ui/screens/Settings";
import { AllowGuests, AuthLayout, AuthMethodScreen, AuthStartScreen, PasswordSignInScreen, QrSignInScreen, RequireAuth } from "./ui/screens/Auth";
import { GenreResultsScreen, MoviesScreen, MyListScreen, TvShowsScreen } from "./ui/screens/Browse";
import { DetailScreen } from "./ui/screens/Detail";
import { GenresScreen } from "./ui/screens/Genres";
import { Home } from "./ui/screens/Home";
import { SearchScreen } from "./ui/screens/Search";
import { SourcesScreen } from "./ui/screens/Sources";

// The player pulls in hls.js / dash.js — only load them when someone actually presses Play.
const PlayerScreen = lazy(() => import("./ui/screens/Player").then((m) => ({ default: m.PlayerScreen })));

function GenreRoute() {
  const { genre } = useParams();
  return <GenreResultsScreen key={genre} genre={genre ?? ""} />;
}

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
    installPlusPreviewFlag();
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
      <Routes>
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
          <Route path="genres" element={<GenresScreen />} />
          <Route path="genres/:genre" element={<GenreRoute />} />
          <Route path="search" element={<SearchScreen />} />
          <Route path="my-list" element={<RequireAuth><MyListScreen /></RequireAuth>} />
          <Route path="settings" element={<RequireAuth><SettingsScreen /></RequireAuth>} />
          <Route path="settings/addons/add" element={<RequireAuth><AddAddonScreen /></RequireAuth>} />
          <Route path="settings/:tab" element={<RequireAuth><SettingsScreen /></RequireAuth>} />
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
