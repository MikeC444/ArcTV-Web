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
import iplayerLogo from "../../assets/streaming/iplayer.webp";
import itvxLogo from "../../assets/streaming/itvx.webp";
import peacockLogo from "../../assets/streaming/peacock.webp";
import skyLogo from "../../assets/streaming/sky.webp";
import skyshowtimeLogo from "../../assets/streaming/skyshowtime.webp";
import huluLogo from "../../assets/streaming/hulu.webp";
import netflixLogo from "../../assets/streaming/netflix.webp";
import paramountLogo from "../../assets/streaming/paramount.webp";
import primeLogo from "../../assets/streaming/prime.webp";

/** The logo of each service that has one; a service without a file shows its name in text instead. */
const LOGOS: Record<string, string> = { netflix: netflixLogo, disney: disneyLogo, prime: primeLogo, max: maxLogo, apple: appleLogo, paramount: paramountLogo, hulu: huluLogo, peacock: peacockLogo, crunchyroll: crunchyrollLogo, skyshowtime: skyshowtimeLogo, britbox: britboxLogo, itvx: itvxLogo, iplayer: iplayerLogo, sky: skyLogo };

/**
 * Each service's own tile colour (what its app icon sits on), and whether its logo is drawn all white or all black on that colour. A logo with no
 * entry shows as it is. A service with no entry here at all (no logo file) is a black tile with its name in white.
 */
const BRAND: Record<string, { bg: string; image?: string; logo?: "white" | "black" }> = {
  netflix: { bg: "#000" },
  disney: { bg: "#0e2d78", image: "linear-gradient(145deg, #1c47a8, #081a4d)" },
  prime: { bg: "#fff" },
  max: { bg: "#000" },
  apple: { bg: "#000" },
  paramount: { bg: "#0064ff", logo: "white" },
  hulu: { bg: "#1ce783", logo: "white" },
  peacock: { bg: "#000" },
  crunchyroll: { bg: "#f47521", logo: "white" },
  skyshowtime: { bg: "#4a38e6", image: "linear-gradient(135deg, #6a3df0, #2b2fe0)" },
  britbox: { bg: "#0d273d" },
  itvx: { bg: "#dfeb55", logo: "black" },
  iplayer: { bg: "#000" },
  sky: { bg: "#fff" },
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
                <Surface to={routes.streaming(id)} className="card__surface" ariaLabel={`${service.name} titles`} background={BRAND[id]?.bg ?? "#000"} backgroundImage={BRAND[id]?.image}>
                  <span className="svc__logo">{logo ? <img src={logo} alt="" data-logo={BRAND[id]?.logo} loading="lazy" decoding="async" draggable={false} /> : <span className="svc__name">{service.name}</span>}</span>
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
