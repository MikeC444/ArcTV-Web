import type { CSSProperties, PointerEvent } from "react";
import { streamingServiceById } from "../../domain/streamingServices";
import { routes } from "../../lib/routes";
import { useVisibleStreamingServices } from "../../state/hooks";
import { Surface } from "./Surface";
import { ScrollRow } from "./ScrollRow";
import appleLogo from "../../assets/streaming/apple.webp";
import disneyLogo from "../../assets/streaming/disney.webp";
import maxLogo from "../../assets/streaming/max.webp";
import britboxLogo from "../../assets/streaming/britbox.webp";
import channel4Logo from "../../assets/streaming/channel4.webp";
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
const LOGOS: Record<string, string> = { netflix: netflixLogo, disney: disneyLogo, prime: primeLogo, max: maxLogo, apple: appleLogo, paramount: paramountLogo, hulu: huluLogo, peacock: peacockLogo, crunchyroll: crunchyrollLogo, skyshowtime: skyshowtimeLogo, britbox: britboxLogo, itvx: itvxLogo, iplayer: iplayerLogo, sky: skyLogo, channel4: channel4Logo };

/**
 * Each service's own tile colour (what its app icon sits on), and whether its logo is drawn all white or all black on that colour. A logo with no
 * entry shows as it is. A service with no entry here at all (no logo file) is a black tile with its name in white.
 */
const BRAND: Record<string, { bg: string; image?: string; logo?: "white" | "black"; glow?: string }> = {
  netflix: { bg: "#000", glow: "rgba(229, 9, 20, 0.55)" },
  disney: { bg: "#003f4f", image: "linear-gradient(175deg, #011828 0%, #002f3d 35%, #015e70 70%, #0098a5 88%, #2bbcc1 100%)", glow: "rgba(30, 190, 200, 0.55)" },
  prime: { bg: "#1d2547", image: "linear-gradient(80deg, #141721 0%, #1d2547 30%, #294071 52%, #346b9f 80%, #4089c0 100%)", logo: "white", glow: "rgba(64, 137, 192, 0.6)" },
  max: { bg: "#fff", glow: "rgba(140, 90, 255, 0.5)" },
  apple: { bg: "#000", glow: "rgba(190, 190, 205, 0.4)" },
  paramount: { bg: "#0064ff", logo: "white", glow: "rgba(0, 100, 255, 0.6)" },
  hulu: { bg: "#1ce783", logo: "white", glow: "rgba(28, 231, 131, 0.5)" },
  peacock: { bg: "#000", glow: "rgba(255, 190, 40, 0.4)" },
  crunchyroll: { bg: "#f47521", logo: "white", glow: "rgba(244, 117, 33, 0.6)" },
  skyshowtime: { bg: "#4a38e6", image: "linear-gradient(135deg, #6a3df0, #2b2fe0)", glow: "rgba(106, 61, 240, 0.6)" },
  britbox: { bg: "#0d273d", glow: "rgba(120, 190, 235, 0.5)" },
  itvx: { bg: "#dfeb55", logo: "black", glow: "rgba(223, 235, 85, 0.5)" },
  iplayer: { bg: "#000", glow: "rgba(255, 70, 150, 0.5)" },
  sky: { bg: "#fff", glow: "rgba(160, 90, 255, 0.5)" },
  channel4: { bg: "#000", glow: "rgba(170, 255, 140, 0.45)" },
};

/**
 * How the tiles look: "glass" (rounded 3D glass slabs with a coloured glow and a pointer tilt) or "flat" (the earlier look: a flat panel in the service's
 * colour). Change this one word to go back; the CSS for both is in `components.css`.
 */
const TILE_STYLE: "glass" | "flat" = "glass";

/** Tips a hovered tile toward the pointer, and moves the spot of light with it (the CSS reads these; nothing tilts with reduced motion or on touch). */
function tiltToward(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse") return;
  const surface = event.currentTarget.querySelector<HTMLElement>(".card__surface");
  if (!surface) return;
  const box = surface.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
  surface.style.setProperty("--tilt-x", `${((0.5 - y) * 12).toFixed(1)}deg`);
  surface.style.setProperty("--tilt-y", `${((x - 0.5) * 14).toFixed(1)}deg`);
  surface.style.setProperty("--glare-x", `${(x * 100).toFixed(0)}%`);
  surface.style.setProperty("--glare-y", `${(y * 100).toFixed(0)}%`);
}
function resetTilt(event: PointerEvent<HTMLDivElement>) {
  const surface = event.currentTarget.querySelector<HTMLElement>(".card__surface");
  for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) surface?.style.removeProperty(name);
}

/**
 * Home's "Streaming services" row, shown only while an installed addon has a catalogue for at least one service the person has not turned off
 * (Settings → Home Rows). The tiles are the size and shape of a Continue Watching card, with the logo where the picture would be.
 */
export function StreamingTiles() {
  const services = useVisibleStreamingServices();
  if (services.length === 0) return null;
  return (
    <section className="row row--streaming" data-tiles={TILE_STYLE} aria-label="Streaming services">
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
              <div className="card" data-cw="true" onPointerMove={TILE_STYLE === "glass" ? tiltToward : undefined} onPointerLeave={TILE_STYLE === "glass" ? resetTilt : undefined}>
                <Surface to={routes.streaming(id)} className="card__surface" ariaLabel={`${service.name} titles`} background={BRAND[id]?.bg ?? "#000"} backgroundImage={BRAND[id]?.image} style={BRAND[id]?.glow ? ({ "--svc-glow": BRAND[id]?.glow } as CSSProperties) : undefined}>
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
