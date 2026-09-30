import backUrl from "../assets/audio/ui_back_sound.wav";
import clickUrl from "../assets/audio/ui_click_sound.wav";
import navUrl from "../assets/audio/ui_nav_sound.wav";
import { useSettings } from "../state/settings";

/**
 * UiSoundPlayer.kt — the same three UI WAVs, played through Web Audio at the "Navigation Volume" set in
 * Settings → Sounds. Browsers only allow audio after a user gesture, so the context is created lazily on the
 * first click/keypress; failures are silent (sound is decoration, never a dependency).
 */
type SoundName = "nav" | "click" | "back";
const URLS: Record<SoundName, string> = { nav: navUrl, click: clickUrl, back: backUrl };

let context: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
const loading = new Map<SoundName, Promise<AudioBuffer | null>>();

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

function load(name: SoundName, ctx: AudioContext): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(name);
  if (!pending) {
    pending = fetch(URLS[name])
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => null);
    loading.set(name, pending);
  }
  return pending;
}

let lastNavAt = 0;

export function playSound(name: SoundName): void {
  const volume = useSettings.getState().navigationVolume;
  if (volume <= 0) return;
  if (name === "nav") {
    // a held arrow key auto-repeats; don't machine-gun the click
    const now = performance.now();
    if (now - lastNavAt < 70) return;
    lastNavAt = now;
  }
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  void load(name, ctx).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  });
}

/** Lets Settings → Sounds preview the current volume. */
export const playPreview = (): void => playSound("click");
