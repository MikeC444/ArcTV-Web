import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { installModalityTracking } from "./lib/modality";
import { installSpatialNavigation } from "./lib/spatialNav";
import { useAuth } from "./state/auth";
import { detachSession, startSession } from "./state/sync";
import { AppShell } from "./ui/layout/AppShell";
import { Spinner } from "./ui/components/States";
import { AddAddonScreen, SettingsScreen } from "./ui/screens/Settings";
import { AuthMethodScreen, AuthStartScreen, PasswordSignInScreen, QrSignInScreen, RedirectIfAuthed, RequireAuth } from "./ui/screens/Auth";
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
        <Route path="/auth" element={<RedirectIfAuthed><AuthStartScreen /></RedirectIfAuthed>} />
        <Route path="/auth/method/:intent" element={<RedirectIfAuthed><AuthMethodScreen /></RedirectIfAuthed>} />
        <Route path="/auth/password/:intent" element={<RedirectIfAuthed><PasswordSignInScreen /></RedirectIfAuthed>} />
        <Route path="/auth/qr/:intent" element={<RedirectIfAuthed><QrSignInScreen /></RedirectIfAuthed>} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="movies" element={<MoviesScreen />} />
          <Route path="tv" element={<TvShowsScreen />} />
          <Route path="genres" element={<GenresScreen />} />
          <Route path="genres/:genre" element={<GenreRoute />} />
          <Route path="search" element={<SearchScreen />} />
          <Route path="my-list" element={<MyListScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="settings/addons/add" element={<AddAddonScreen />} />
          <Route path="settings/:tab" element={<SettingsScreen />} />
          <Route path="detail/:providerId/:type/:id" element={<DetailScreen />} />
          <Route path="sources/:providerId/:type/:id/:season/:episode" element={<SourcesScreen />} />
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
