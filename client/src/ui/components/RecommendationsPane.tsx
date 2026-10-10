import { useMemo, useState } from "react";
import { MdCheck, MdChevronRight, MdClose, MdLock, MdOutlineThumbDown, MdOutlineThumbUp, MdRestartAlt, MdThumbDown, MdThumbUp, MdWorkspacePremium } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { useHasPlus } from "../../state/plusAccess";
import { INTERACTION_DETAIL_FETCH_LIMIT, MIN_INTERACTIONS_FOR_PERSONALISATION, SIGNAL_WEIGHTS } from "../../domain/recommend/config";
import { routes } from "../../lib/routes";
import { useFeedback, type FeedbackEntry } from "../../state/feedback";
import { useMyList } from "../../state/myList";
import { ArcButton } from "./Buttons";
import { Surface } from "./Surface";

/** Cinemeta ids are IMDb ids, whose posters live at Metahub: a fallback for ratings made before the poster was kept. */
const metahubPoster = (id: string): string | null => (/^tt\d+$/.test(id) ? `https://images.metahub.space/poster/small/${id}/img` : null);

interface Rated {
  id: string;
  entry: FeedbackEntry;
  poster: string | null;
}

/** "+20 points", "-15 points", "0 points". */
const points = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${Math.abs(n) === 1 ? "point" : "points"}`;

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
        <ArcButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={() => navigate(routes.settings("plus"))} />
      </div>
    );
  }
  return <RecommendationsContent />;
}

function RecommendationsContent() {
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
  // a title you rated counts once, by its rating; finishing or saving only counts for titles you have not rated
  const unrated = list.filter((i) => !entries[i.id]);
  const finished = unrated.filter((i) => i.watched).length;
  const saved = unrated.length - finished;
  const likePoints = rated.like.length * SIGNAL_WEIGHTS.like;
  const dislikePoints = rated.dislike.length * SIGNAL_WEIGHTS.dislike;
  const signals = rated.like.length + rated.dislike.length + unrated.length;
  const ready = signals >= MIN_INTERACTIONS_FOR_PERSONALISATION && rated.like.length + finished + saved > 0;
  const listPoints = finished * SIGNAL_WEIGHTS.completed + saved * SIGNAL_WEIGHTS.watchlist;
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
            <li><span className="recs__icon" aria-hidden="true"><MdOutlineThumbUp /></span><span><strong>Titles you like</strong> ({rated.like.length}): <span className="recs__pts" data-sign="plus">{points(likePoints)}</span><br /><span className="c-text-2">{SIGNAL_WEIGHTS.like} points each, shared across the title's genres, directors and cast. Pulls in more like it.</span></span></li>
            <li><span className="recs__icon" aria-hidden="true"><MdOutlineThumbDown /></span><span><strong>Titles marked Not for me</strong> ({rated.dislike.length}): <span className="recs__pts" data-sign="minus">{points(dislikePoints)}</span><br /><span className="c-text-2">{SIGNAL_WEIGHTS.dislike} points each, shared the same way. The title itself is never picked, and similar titles are pushed down.</span></span></li>
            <li><span className="recs__icon" aria-hidden="true"><MdChevronRight /></span><span><strong>Your My List and finished titles</strong> ({finished} finished, {saved} saved): <span className="recs__pts" data-sign="plus">{points(listPoints)}</span><br /><span className="c-text-2">{SIGNAL_WEIGHTS.completed} points for each finished, {SIGNAL_WEIGHTS.watchlist} for each saved, when you have not rated it. Movies count as finished when you watch them to the end; mark a show as watched yourself.</span></span></li>
          </ul>
          <p className="t-label-sm c-text-3 recs__note">Points are how much each title counts toward your taste. They are not a score.</p>
          {signals > INTERACTION_DETAIL_FETCH_LIMIT ? <p className="t-label-sm c-text-3 recs__note">Only your {INTERACTION_DETAIL_FETCH_LIMIT} strongest ratings and saves are used for your picks right now.</p> : null}
          {!ready ? <p className="t-label-sm c-text-3 recs__note">Not enough yet: your picks start once you have at least {MIN_INTERACTIONS_FOR_PERSONALISATION} titles you like, finished, saved or marked Not for me, and at least one of them liked, finished or saved. Until then Home shows popular titles.</p> : null}
        </section>
      </div>

      <section className="recs__card" aria-labelledby="recs-how">
        <h3 id="recs-how" className="t-title-md recs__h">How it works</h3>
        <ol className="recs__steps">
          <li><strong>It learns your taste.</strong> Every movie or show you like, finish or save adds points toward the genres, directors and cast you enjoy. A Like counts most, and Not for me counts against.</li>
          <li><strong>It scores what is on offer.</strong> Titles from your Home rows are compared with your taste, mostly on genre, then on director and cast. Titles you have already finished, rated or are watching are left out.</li>
          <li><strong>It shows a spread.</strong> Your strongest matches stay, and the rest of the row follows your mix of tastes, so a smaller taste still gets its share.</li>
          <li><strong>It changes when you refresh.</strong> Most of the row is different next time, and no single title of yours can explain too many picks.</li>
          <li><strong>It explains itself.</strong> The line under most picks names the title behind it. A few say "More from directors you enjoy" instead, and with no real match no reason is shown.</li>
        </ol>
        <p className="t-label-sm c-text-3" style={{ margin: "10px 0 0" }}>Shows and movies both count. The ranking is only for ordering your row: it is not a rating or a percentage.</p>
      </section>

      <section className="recs__card recs__reset" aria-labelledby="recs-reset">
        <span className="recs__icon" aria-hidden="true"><MdRestartAlt /></span>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h3 id="recs-reset" className="t-title-md recs__h" style={{ margin: 0 }}>Reset preferences</h3>
          <p className="t-body-sm c-text-2" style={{ margin: "2px 0 0" }}>Clears every Like and Not for me on this profile ({total} now). Your picks still use your My List and finished titles, and a title you removed from the row stays out for 5 days.</p>
        </div>
        {confirming ? (
          <div className="recs__confirm" role="group" aria-label="Confirm reset">
            <ArcButton text="Yes, reset" icon={<MdCheck />} variant="filled" compact onClick={reset} />
            <ArcButton text="Cancel" icon={<MdClose />} compact onClick={() => setConfirming(false)} />
          </div>
        ) : (
          <ArcButton text="Reset preferences" icon={<MdRestartAlt />} compact disabled={total === 0} onClick={() => setConfirming(true)} />
        )}
      </section>
    </div>
  );
}
