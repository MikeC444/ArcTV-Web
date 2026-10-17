/**
 * The colour of the soft light behind the Home hero: the title's own artwork, boiled down to one colour.
 * Works on a small RGBA sample (see sampleBackdrop). Dark corners and white text carry no colour, so pixels are weighted by how
 * saturated and how bright they are; a picture with no real colour (black and white, mostly dark) gives null and the page stays neutral.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const MIN_SHARE = 0.04; // less than this much coloured picture and there is nothing worth glowing

export function washColor(data: ArrayLike<number>): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  let pixels = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 200) continue; // see-through
    const pr = data[i]!;
    const pg = data[i + 1]!;
    const pb = data[i + 2]!;
    pixels++;
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max < 40 || min > 225) continue; // near black or near white
    const saturation = (max - min) / max;
    const w = saturation * saturation * (max / 255);
    r += pr * w;
    g += pg * w;
    b += pb * w;
    weight += w;
  }
  if (pixels === 0 || weight / pixels < MIN_SHARE * 0.25) return null;
  const mr = r / weight;
  const mg = g / weight;
  const mb = b / weight;
  // lift it to a clear, not muddy, colour: brightest channel to 200 so a dim picture still gives a visible light
  const top = Math.max(mr, mg, mb);
  if (top < 1) return null;
  const k = 200 / top;
  return { r: Math.round(Math.min(255, mr * k)), g: Math.round(Math.min(255, mg * k)), b: Math.round(Math.min(255, mb * k)) };
}

export const toCss = (c: Rgb): string => `rgb(${c.r} ${c.g} ${c.b})`;

const cache = new Map<string, Rgb | null>();

/**
 * Reads the picture's colour in the browser. The picture is asked for with CORS so its pixels may be read; an address that does not allow it
 * (or does not load) gives null, and the page simply shows no wash. Each address is read once.
 */
export function backdropColor(url: string): Promise<Rgb | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  return new Promise((resolve) => {
    const done = (c: Rgb | null) => {
      cache.set(url, c);
      resolve(c);
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 18;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        done(washColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch {
        done(null); // a picture that does not allow its pixels to be read
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}
