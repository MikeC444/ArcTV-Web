import { streamingServiceById } from "../../domain/streamingServices";
import { routes } from "../../lib/routes";
import { useVisibleStreamingServices } from "../../state/hooks";
import { Surface } from "./Surface";
import { ScrollRow } from "./ScrollRow";
import appleLogo from "../../assets/streaming/apple.webp";
import disneyLogo from "../../assets/streaming/disney.webp";
import maxLogo from "../../assets/streaming/max.webp";
import britboxLogo from "../../assets/streaming/britbox.webp";
import crunchyrollLogo from "../../assets/streaming/crunchyroll.webp";
import itvxLogo from "../../assets/streaming/itvx.webp";
import peacockLogo from "../../assets/streaming/peacock.webp";
import skyshowtimeLogo from "../../assets/streaming/skyshowtime.webp";
import huluLogo from "../../assets/streaming/hulu.webp";
import netflixLogo from "../../assets/streaming/netflix.webp";
import paramountLogo from "../../assets/streaming/paramount.webp";
import primeLogo from "../../assets/streaming/prime.webp";

/** The logo of each service that has one; a service without a file shows its name in text instead. */
const LOGOS: Record<string, string> = { netflix: netflixLogo, disney: disneyLogo, prime: primeLogo, max: maxLogo, apple: appleLogo, paramount: paramountLogo, hulu: huluLogo, peacock: peacockLogo, crunchyroll: crunchyrollLogo, skyshowtime: skyshowtimeLogo, britbox: britboxLogo, itvx: itvxLogo };

/** A dark tint behind each logo (close to the brand's colour), so the logo reads the same on every tile. */
const TINTS: Record<string, string> = {
  netflix: "#1c0709",
  disney: "#0a1636",
  prime: "#06202c",
  max: "#160c34",
  apple: "#1e1e22",
  paramount: "#08142e",
  hulu: "#07241a",
  peacock: "#14141a",
  crunchyroll: "#241005",
  skyshowtime: "#0b0b12",
  britbox: "#0d273d",
  itvx: "#111a05",
};

/**
 * Home's "Streaming services" row, shown only while an installed addon has a catalogue for at least one service the person has not turned off
 * (Settings → Home Rows). The tiles are the size and shape of a Continue Watching card, with the logo where the picture would be.
 */
export function StreamingTiles() {
  const services = useVisibleStreamingServices();
  if (services.length === 0) return null;
  return (
    <section className="row row--streaming" aria-label="Streaming services">
      <h2 className="row__title" style={{ margin: 0 }}>
        Streaming services
      </h2>
      <ScrollRow label="Streaming services" className="row__scroller row__scroller--posters hide-scroll" contentKey={services.join(",")} centerOn=".card__surface" role="list">
        {services.map((id) => {
          const service = streamingServiceById(id);
          if (!service) return null;
          const logo = LOGOS[id];
          return (
            <div role="listitem" key={id} style={{ display: "contents" }}>
              <div className="card" data-cw="true">
                <Surface to={routes.streaming(id)} className="card__surface" ariaLabel={`${service.name} titles`} background={TINTS[id] ?? "var(--surface)"}>
                  <span className="svc__logo">{logo ? <img src={logo} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="svc__name">{service.name}</span>}</span>
                </Surface>
                <div className="card__title">{service.name}</div>
              </div>
            </div>
          );
        })}
      </ScrollRow>
    </section>
  );
}
