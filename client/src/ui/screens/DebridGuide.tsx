import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { routes } from "../../lib/routes";

/** One numbered step: a big number, a short heading and plain words underneath. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="guide__step">
      <span className="guide__num" aria-hidden="true">{n}</span>
      <div className="guide__stepbody">
        <h3 className="guide__steptitle">{title}</h3>
        {children}
      </div>
    </li>
  );
}

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">{children}</a>
);

/** A beginner's guide to getting sources: debrid service → Torrentio → Arc TV. Hidden for now: no link points here, search engines are told to skip it. */
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
      <h1 className="t-display-md page__title">How to get sources that play</h1>
      <div className="guide">
        <p className="guide__lead">
          Arc TV is a player. It shows you movies and shows, but it needs somewhere to get the video from. This guide shows you how to connect that, one small
          step at a time. You don't need to be good with computers.
        </p>

        <div className="guide__box">
          <h2 className="guide__boxtitle">The short version</h2>
          <ol className="guide__short">
            <li><strong>Debrid service:</strong> a small subscription that gives you fast, ready-to-play links.</li>
            <li><strong>Torrentio:</strong> a free addon that finds those links. You connect it to your debrid service.</li>
            <li><strong>Arc TV:</strong> you paste one link into the app, and you're done.</li>
          </ol>
          <p className="guide__plain">
            <strong>A plan is very cheap.</strong> Plans usually cost only a few dollars a month, and you can stop any time. You only need one service. The price
            is on the service's own website, so check there for today's plans.
          </p>
        </div>

        <nav className="guide__toc" aria-label="Jump to a part">
          <a href="#part-1">Part 1 · Debrid service</a>
          <a href="#part-2">Part 2 · Torrentio</a>
          <a href="#part-3">Part 3 · Arc TV</a>
          <a href="#trouble">Something went wrong?</a>
        </nav>

        <section id="part-1" className="guide__section">
          <p className="guide__part">Part 1 of 3</p>
          <h2 className="guide__h2">Get a debrid service</h2>
          <p className="guide__p">
            A debrid service is a website you pay a small amount to each month. It does the heavy lifting and gives Arc TV a link that plays straight away. The two
            most popular are <strong>Real-Debrid</strong> and <strong>TorBox</strong>. Pick one. You don't need both.
          </p>

          <ol className="guide__steps">
            <Step n={1} title="Make an account">
              <p>Go to the website of the one you chose and sign up with your email.</p>
              <p><Ext href="https://real-debrid.com">real-debrid.com</Ext> or <Ext href="https://torbox.app">torbox.app</Ext></p>
            </Step>
            <Step n={2} title="Buy a plan">
              <p>
                Pick the cheapest plan to start. It's very cheap, and the lowest one is all you need. The website will walk you through paying.
              </p>
            </Step>
            <Step n={3} title="Find your API key">
              <p>
                An <strong>API key</strong> is just a long password made of letters and numbers. It lets Torrentio use the plan you paid for. You will copy it in a
                moment.
              </p>
              <ul>
                <li><strong>Real-Debrid:</strong> while signed in, open <Ext href="https://real-debrid.com/apitoken">real-debrid.com/apitoken</Ext> and copy the long code you see.</li>
                <li><strong>TorBox:</strong> sign in, open <strong>Settings</strong>, and copy your API key.</li>
              </ul>
            </Step>
            <Step n={4} title="Keep it safe">
              <p>
                Leave the page open, or paste the key into a note on your phone for the next part.
              </p>
            </Step>
          </ol>

          <p className="guide__warn">
            <strong>Never share your API key.</strong> Anyone with it can use the plan you paid for. If it ever leaks, make a new one on the service's website.
          </p>
        </section>

        <section id="part-2" className="guide__section">
          <p className="guide__part">Part 2 of 3</p>
          <h2 className="guide__h2">Connect it to Torrentio</h2>
          <p className="guide__p">
            Torrentio is a free addon that searches for your movies and shows. Here you tell it about your debrid service. At the end it gives you one special link,
            which you will use in Part 3.
          </p>

          <ol className="guide__steps">
            <Step n={1} title="Open the Torrentio setup page">
              <p>Open this page in your browser:</p>
              <p><Ext href="https://torrentio.strem.fun/configure">torrentio.strem.fun/configure</Ext></p>
            </Step>
            <Step n={2} title="Choose your debrid service">
              <p>Scroll down to the box that says <strong>Debrid provider</strong>. Click it and choose the service you signed up for (<strong>RealDebrid</strong> or <strong>TorBox</strong>).</p>
            </Step>
            <Step n={3} title="Paste your API key">
              <p>A new box appears. Paste the API key from Part 1 into it.</p>
              <p>
                With Real-Debrid there may also be a <strong>Continue to Real-Debrid</strong> button. You can use it to sign in and it will fill the key in for you.
              </p>
            </Step>
            <Step n={4} title="Leave everything else alone">
              <p>
                The other settings are optional and the defaults work well. If you want, you can pick the best quality first, or leave out very large 4K files if
                your internet is slow. If you're not sure, skip it.
              </p>
            </Step>
            <Step n={5} title="Copy your link">
              <p>Scroll to the very bottom of the page. You'll see a button called <strong>Install</strong>.</p>
              <p>
                <strong>Don't click Install.</strong> It's built for a different app. Copy the link instead:
              </p>
              <ul>
                <li><strong>On a computer:</strong> right-click the Install button and choose <strong>Copy link address</strong>.</li>
                <li><strong>On a phone:</strong> press and hold the Install button, then choose <strong>Copy link</strong>.</li>
              </ul>
              <p>
                The link looks something like <code>https://torrentio.strem.fun/realdebrid=…/manifest.json</code>. It may start with <code>stremio://</code>, and Arc TV
                accepts that too.
              </p>
            </Step>
          </ol>

          <p className="guide__warn">
            <strong>This link has your API key inside it.</strong> Only paste it into Arc TV. Don't post it or send it to anyone.
          </p>
        </section>

        <section id="part-3" className="guide__section">
          <p className="guide__part">Part 3 of 3</p>
          <h2 className="guide__h2">Add Torrentio to Arc TV</h2>
          <p className="guide__p">Last part. You paste the link you copied and Arc TV does the rest.</p>

          <ol className="guide__steps">
            <Step n={1} title="Open the Addons page">
              <p>Sign in to Arc TV, then go to <Link to={routes.settings("addons")}>Settings → Addons</Link>.</p>
            </Step>
            <Step n={2} title="Press Add addon">
              <p>Or go straight to <Link to={routes.addAddon}>the Add addon page</Link>.</p>
            </Step>
            <Step n={3} title="Paste your link">
              <p>Click the box, paste the link from Part 2, and press <strong>Install</strong>.</p>
            </Step>
            <Step n={4} title="Wait for the tick">
              <p>After a moment you'll see <strong>Torrentio installed ✓</strong>. It now shows in your addon list.</p>
            </Step>
            <Step n={5} title="Play something">
              <p>
                Open any movie or show and press <strong>Play</strong>. To pick a source yourself, open <strong>Sources</strong> to see everything Torrentio found.
              </p>
            </Step>
          </ol>

          <p className="guide__done">
            <strong>That's it, you're done.</strong> Your addons are saved to your account, so they also show up on your other devices once you sign in to Arc TV.
          </p>
        </section>

        <section id="trouble" className="guide__section">
          <h2 className="guide__h2">Something went wrong?</h2>
          <dl className="guide__faq">
            <dt>It says "Couldn't install that addon"</dt>
            <dd>The link was probably cut short. It must end in <code>/manifest.json</code>. Go back to the Torrentio page and copy it again.</dd>
            <dt>There are no sources, or a source won't play</dt>
            <dd>
              Check that your debrid plan is still active and you used the right API key. If you made a new key, repeat Part 2 to get a new link and replace the old
              addon.
            </dd>
            <dt>I want to change my debrid service or key</dt>
            <dd>In Settings → Addons, remove Torrentio. Then do Part 2 and Part 3 again with the new details.</dd>
            <dt>One title has no sources</dt>
            <dd>Not every title is available everywhere. Try a different source in the list, or a different title.</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
