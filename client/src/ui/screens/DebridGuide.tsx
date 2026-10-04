import { useEffect } from "react";
import { Link } from "react-router-dom";
import { routes } from "../../lib/routes";

/** A step-by-step guide to getting sources: debrid service → Torrentio → Arc TV. Hidden for now: no link points here, search engines are told to skip it. */
export function DebridGuideScreen() {
  useEffect(() => {
    document.title = "Set up a debrid service · Arc TV";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  return (
    <div className="page">
      <h1 className="t-display-md page__title">Set up a debrid service</h1>
      <div className="guide">
        <p className="t-body-lg c-text-2 guide__lead">
          Arc TV plays links, not torrents. To get sources that play, you connect an addon (here, Torrentio) to a <strong>debrid service</strong> you
          subscribe to. The debrid service turns torrent results into ready-to-play links. This takes about five minutes and has three parts.
        </p>

        <nav className="guide__toc" aria-label="Steps">
          <a href="#part-1">1. Set up a debrid service</a>
          <a href="#part-2">2. Connect it to Torrentio</a>
          <a href="#part-3">3. Add Torrentio to Arc TV</a>
          <a href="#trouble">Troubleshooting</a>
        </nav>

        <section id="part-1" className="guide__section">
          <h2 className="t-title-lg">1. Set up a debrid service</h2>
          <p className="t-body-md c-text-2">
            A debrid service is a paid subscription. Torrentio works with several; the two most common are <strong>Real-Debrid</strong> and{" "}
            <strong>TorBox</strong>. You only need one.
          </p>
          <ol className="guide__steps">
            <li>
              Go to the service's website and create an account: <a href="https://real-debrid.com" target="_blank" rel="noreferrer">real-debrid.com</a> or{" "}
              <a href="https://torbox.app" target="_blank" rel="noreferrer">torbox.app</a>.
            </li>
            <li>Buy a plan (or the trial, if the service offers one). Check the current prices and payment options on the service's own site.</li>
            <li>
              Find your <strong>API key</strong>, a long string of letters and numbers that lets Torrentio use your subscription:
              <ul>
                <li>
                  <strong>Real-Debrid:</strong> open <a href="https://real-debrid.com/apitoken" target="_blank" rel="noreferrer">real-debrid.com/apitoken</a> while signed in and copy the API token.
                </li>
                <li>
                  <strong>TorBox:</strong> sign in, open <strong>Settings</strong> and copy your API key from the account section.
                </li>
              </ul>
            </li>
            <li>Keep the key somewhere you can paste it from for the next part.</li>
          </ol>
          <p className="guide__note">
            <strong>Treat the key like a password.</strong> Anyone who has it can use your subscription. Don't post it or share it, and if it leaks,
            generate a new one on the service's site.
          </p>
        </section>

        <section id="part-2" className="guide__section">
          <h2 className="t-title-lg">2. Connect your debrid service to Torrentio</h2>
          <p className="t-body-md c-text-2">Torrentio is an addon that finds sources. Its setup page builds a personal addon link that has your debrid key inside it.</p>
          <ol className="guide__steps">
            <li>
              Open <a href="https://torrentio.strem.fun/configure" target="_blank" rel="noreferrer">torrentio.strem.fun/configure</a> in your browser.
            </li>
            <li>
              Scroll to the <strong>Debrid provider</strong> drop-down and pick <strong>RealDebrid</strong> or <strong>TorBox</strong> (whichever you signed up for).
            </li>
            <li>
              Paste your API key into the box that appears. For Real-Debrid you can usually also choose <strong>Continue to Real-Debrid</strong> to sign in and have
              the key filled in for you.
            </li>
            <li>
              Optional but worth a look: <strong>Sort by</strong> (quality first is a good default), <strong>Priority foreign language</strong>, and{" "}
              <strong>Exclude qualities</strong> (for example leave out 4K if your screen or connection can't use it, or CAM/screener copies).
              Leave <em>Do not show download links</em> alone. Don't tick anything you don't understand; the defaults work.
            </li>
            <li>
              Scroll to the bottom. The <strong>Install</strong> button builds your link. Don't press Install, because that tries to open Stremio. Instead copy the
              link: right-click Install and choose <strong>Copy link address</strong> (on a phone, press and hold). It looks like{" "}
              <code>https://torrentio.strem.fun/realdebrid=YOUR_KEY/manifest.json</code> (it may begin with <code>stremio://</code>, which Arc TV also accepts).
            </li>
          </ol>
          <p className="guide__note">
            That link contains your API key. Only paste it into Arc TV (or another app you trust), and don't share it.
          </p>
        </section>

        <section id="part-3" className="guide__section">
          <h2 className="t-title-lg">3. Add Torrentio to Arc TV</h2>
          <ol className="guide__steps">
            <li>
              In Arc TV, sign in and open <Link to={routes.settings("addons")}>Settings → Addons</Link>.
            </li>
            <li>
              Choose <strong>Add addon</strong> (or go straight to <Link to={routes.addAddon}>the add addon page</Link>).
            </li>
            <li>
              Paste the link you copied in part 2 into the box and press <strong>Install</strong>.
            </li>
            <li>
              Wait for <strong>Torrentio installed ✓</strong>. It now appears in your addon list. If you also have other addons, you can switch each one on or off
              there.
            </li>
            <li>
              Open any movie or episode and press <strong>Play</strong>, or open <strong>Sources</strong> to see what Torrentio found. Sources from your debrid
              service play straight away.
            </li>
          </ol>
          <p className="guide__note">
            Your addons follow your account, so once added here they are on your other devices where you're signed in to Arc TV.
          </p>
        </section>

        <section id="trouble" className="guide__section">
          <h2 className="t-title-lg">Troubleshooting</h2>
          <dl className="guide__faq">
            <dt>"Couldn't install that addon"</dt>
            <dd>Check the link ends in <code>/manifest.json</code> and that you copied all of it. Try copying it again from the Torrentio page.</dd>
            <dt>No sources, or sources that won't play</dt>
            <dd>
              Make sure your debrid subscription is active and that the API key in the link is the current one. If you regenerated your key, build a new link
              in part 2 and replace the old addon.
            </dd>
            <dt>I changed my debrid service or key</dt>
            <dd>Remove Torrentio under Settings → Addons, then repeat parts 2 and 3 with the new details.</dd>
            <dt>Some titles have no sources</dt>
            <dd>Not every title is available through every addon or debrid service. Try another source from the Sources list, or another title.</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
