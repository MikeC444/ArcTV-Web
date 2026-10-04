// Old bookmarks like arctv.org/movies or arctv.org/detail/... used to open the app. The app now lives at
// web.arctv.org, so forward those paths there (keeping the query string and hash). "/" stays on this page.
(function () {
  var appPaths = /^\/(movies|tv|tv-shows|genres|search|my-list|settings|detail|sources|player|profiles|auth|admin)(\/|$)/;
  if (appPaths.test(location.pathname)) {
    location.replace("https://web.arctv.org" + location.pathname + location.search + location.hash);
  }
})();
