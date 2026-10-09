import { useMemo, useState } from "react";
import { MdCheck, MdChevronRight, MdClose, MdLock, MdOutlineThumbDown, MdOutlineThumbUp, MdRestartAlt, MdThumbDown, MdThumbUp, MdWorkspacePremium } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { useHasPlus } from "../../state/plusAccess";
import { routes } from "../../lib/routes";
import { useAuth } from "../../state/auth";
import { useFeedback, type FeedbackEntry } from "../../state/feedback";
import { readLastPicks } from "../../state/lastPicks";
import { useMyList } from "../../state/myList";
import { activeProfileId } from "../../state/profile";
import { MangoButton } from "./Buttons";
import { Surface } from "./Surface";

/** Cinemeta ids are IMDb ids, whose posters live at Metahub: a fallback for ratings made before the poster was kept. */
const metahubPoster = (id: string): string | null => (/^tt\d+$/.test(id) ? `https://images.metahub.space/poster/small/${id}/img` : null);

interface Rated {
  id: string;
  entry: FeedbackEntry;
  poster: string | null;
}

function Poster({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <div className="recs__noposter" aria-hidden="true">{title.slice(0, 1).toUpperCase()}</div>;
  return <img className="recs__poster" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Settings → Recommendations (Plus): what you have rated, what shaped the picks, why the last row was picked, and how it all works. */
export function RecommendationsPane() {
  const hasPlus = useHasPlus();
  const navigate = useNavigate();
  if (!hasPlus) {
    return (
      <div className="stats__locked">
        <MdLock aria-hidden="true" />
        <p className="t-body-md" style={{ margin: 0 }}><strong>Recommendations are only for ArcTV Plus.</strong></p>
        <p className="t-body-sm c-text-2" style={{ margin: 0 }}>See what shapes your Picked for you row and fine-tune it here.</p>
        <MangoButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={() => navigate(routes.settings("plus"))} />
      </div>
    );
  }
  return <RecommendationsContent />;
}

function RecommendationsContent() {
  const userId = useAuth((s) => s.user?.id);
  const entries = useFeedback((s) => s.entries);
  const setFeedback = useFeedback((s) => s.set);
  const list = useMyList((s) => s.items);
  const [tab, setTab] = useState<"like" | "dislike">("like");
  const [confirming, setConfirming] = useState(false);

  const posterById = useMemo(() => new Map(list.map((i) => [i.id, i.posterUrl])), [list]);
  const rated = useMemo(() => {
    const all: Rated[] = Object.entries(entries).map(([id, entry]) => ({ id, entry, poster: entry.posterUrl ?? posterById.get(id) ?? metahubPoster(id) }));
    return { like: all.filter((r) => r.entry.value === "like").sort((a, b) => b.entry.at.localeCompare(a.entry.at)), dislike: all.filter((r) => r.entry.value === "dislike").sort((a, b) => b.entry.at.localeCompare(a.entry.at)) };
  }, [entries, posterById]);
  const picks = useMemo(() => (userId ? readLastPicks(userId, activeProfileId(userId)).slice(0, 5) : []), [userId]);
  const finished = list.filter((i) => i.watched).length;
  const saved = list.length - finished;
  const shown = rated[tab];
  const total = rated.like.length + rated.dislike.length;

  const remove = (r: Rated) => setFeedback({ id: r.id, title: r.entry.title, providerId: r.entry.providerId, type: r.entry.contentType }, null);
  const reset = () => {
    for (const r of [...rated.like, ...rated.dislike]) remove(r);
    setConfirming(false);
  };

  return (
    <div className="recs">
      <p className="t-body-sm c-text-2 recs__lead">See what shapes your Picked for you row, and fine-tune what you see.</p>

      <div className="recs__cols">
        <section className="recs__card" aria-label="Your ratings">
          <div className="recs__tabs" role="tablist" aria-label="Your ratings">
            <button type="button" role="tab" className="recs__tab" aria-selected={tab === "like"} onClick={() => setTab("like")}>Liked ({rated.like.length})</button>
            <button type="button" role="tab" className="recs__tab" aria-selected={tab === "dislike"} onClick={() => setTab("dislike")}>Not for me ({rated.dislike.length})</button>
          </div>
          {shown.length === 0 ? (
            <p className="t-body-sm c-text-2 recs__empty">
              {tab === "like" ? "Nothing liked yet. Press Like on any movie or show and it shows up here." : "Nothing marked Not for me yet. Those titles, and ones like them, are left out of your picks."}
            </p>
          ) : (
            <div role="tabpanel"><ul className="recs__grid">
              {shown.map((r) => (
                <li key={r.id} className="recs__item">
                  <div className="recs__thumb">
                    <Link className="recs__link" to={routes.detail(r.entry.providerId ?? "com.linvo.cinemeta", r.entry.contentType ?? "MOVIE", r.id, r.entry.title)} aria-label={`Open ${r.entry.title}`}>
                      <Poster url={r.poster} title={r.entry.title} />
                    </Link>
                    <span className="recs__badge" aria-hidden="true">{tab === "like" ? <MdThumbUp /> : <MdThumbDown />}</span>
                    <Surface className="recs__remove" radius="999px" ariaLabel={`Remove ${r.entry.title} from ${tab === "like" ? "Liked" : "Not for me"}`} onClick={() => remove(r)}>
                      <MdClose />
                    </Surface>
                  </div>
                  <div className="recs__name clamp-2">{r.entry.title}</div>
                </li>
              ))}
            </ul></div>
          )}
        </section>

        <section className="recs__card" aria-labelledby="recs-shapes">
          <h3 id="recs-shapes" className="t-title-md recs__h">What shapes your picks</h3>
          <ul className="recs__shapes">
            <li><span className="recs__icon" aria-hidden="true"><MdOutlineThumbUp /></span><span><strong>Titles you like</strong> ({rated.like.length})<br /><span className="c-text-2">Pull in more with similar genres, directors and cast.</span></span></li>
            <li><span className="recs__icon" aria-hidden="true"><MdOutlineThumbDown /></span><span><strong>Titles marked Not for me</strong> ({rated.dislike.length})<br /><span className="c-text-2">Push similar titles down, and never come back as picks.</span></span></li>
            <li><span className="recs__icon" aria-hidden="true"><MdChevronRight /></span><span><strong>Your My List and finished titles</strong> ({finished} finished, {saved} saved)<br /><span className="c-text-2">Finishing counts for a little, saving for a little less.</span></span></li>
          </ul>
        </section>
      </div>

      <section className="recs__card" aria-labelledby="recs-why">
        <h3 id="recs-why" className="t-title-md recs__h">Why these were picked</h3>
        {picks.length === 0 ? (
          <p className="t-body-sm c-text-2 recs__empty">Once you have rated a few titles, open Home and the reason for each pick shows here.</p>
        ) : (
          <ul className="recs__why">
            {picks.map((p) => (
              <li key={p.id} className="recs__pick">
                <div className="recs__pickposter"><Poster url={p.posterUrl ?? metahubPoster(p.id)} title={p.title} /></div>
                <div className="recs__pickbody">
                  <div className="t-title-md">{p.title}</div>
                  <div className="t-body-sm c-text-2">{p.reason ?? "A popular pick for you"}</div>
                  {p.genres.length > 0 ? <div className="recs__chips">{p.genres.slice(0, 3).map((g) => <span key={g} className="recs__chip">{g}</span>)}</div> : null}
                  {p.providerId ? <Link className="recs__more" to={routes.detail(p.providerId, p.type, p.id, p.title)}>View details <MdChevronRight aria-hidden="true" /></Link> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="recs__card" aria-labelledby="recs-how">
        <h3 id="recs-how" className="t-title-md recs__h">How it works</h3>
        <ol className="recs__steps">
          <li><strong>It learns your taste.</strong> Every movie or show you like, finish or save counts toward the genres, directors and cast you enjoy. A Like counts most. Not for me counts against.</li>
          <li><strong>It scores what is on offer.</strong> Titles from your Home rows are compared with your taste, mostly on genre, then on director and cast. Titles you have already finished, rated or are watching are left out.</li>
          <li><strong>It shows a spread.</strong> Your strongest matches stay, and the rest of the row follows your mix of tastes, so a smaller taste still gets its share.</li>
          <li><strong>It changes when you refresh.</strong> Most of the row is different next time, and no single title of yours can explain too many picks.</li>
          <li><strong>It explains itself.</strong> The line under each pick names the title behind it, and nothing is made up: with no real match there is no reason shown.</li>
        </ol>
        <p className="t-label-sm c-text-3" style={{ margin: "10px 0 0" }}>Shows and movies both count. The ranking is only for ordering your row: it is not a rating or a percentage.</p>
      </section>

      <section className="recs__card recs__reset" aria-labelledby="recs-reset">
        <span className="recs__icon" aria-hidden="true"><MdRestartAlt /></span>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h3 id="recs-reset" className="t-title-md recs__h" style={{ margin: 0 }}>Reset preferences</h3>
          <p className="t-body-sm c-text-2" style={{ margin: "2px 0 0" }}>Start fresh. Clears every Like and Not for me on this profile ({total} now). My List and watch history stay.</p>
        </div>
        {confirming ? (
          <div className="recs__confirm" role="group" aria-label="Confirm reset">
            <MangoButton text="Yes, reset" icon={<MdCheck />} variant="filled" compact onClick={reset} />
            <MangoButton text="Cancel" icon={<MdClose />} compact onClick={() => setConfirming(false)} />
          </div>
        ) : (
          <MangoButton text="Reset preferences" icon={<MdRestartAlt />} compact disabled={total === 0} onClick={() => setConfirming(true)} />
        )}
      </section>
    </div>
  );
}
