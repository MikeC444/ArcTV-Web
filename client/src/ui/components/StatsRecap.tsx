import { useState } from "react";
import { MdDownload, MdIosShare } from "react-icons/md";
import { recapOf, type Recap } from "../../domain/recap";
import type { WatchStats } from "../../domain/stats";
import { ArcButton } from "./Buttons";

const W = 1080;
const H = 1350;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Draws the recap as a picture (text only, so nothing from another site taints it); null when this browser can't draw one. */
export async function recapImage(recap: Recap): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const sky = g.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, "#07101f");
  sky.addColorStop(0.55, "#10193a");
  sky.addColorStop(1, "#2a1458");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.2, H * 0.12, 20, W * 0.2, H * 0.12, 700);
  glow.addColorStop(0, "rgba(25, 230, 255, 0.28)");
  glow.addColorStop(1, "rgba(25, 230, 255, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.textBaseline = "alphabetic";
  g.fillStyle = "#19e6ff";
  g.font = `800 64px ${FONT}`;
  g.fillText("ArcTV", 90, 150);
  g.fillStyle = "#e8f1ff";
  g.font = `700 56px ${FONT}`;
  g.fillText(recap.heading, 90, 300);
  g.fillStyle = "#a9b8d0";
  g.font = `600 40px ${FONT}`;
  g.fillText("I've watched", 90, 420);
  const big = g.createLinearGradient(90, 0, W - 90, 0);
  big.addColorStop(0, "#19e6ff");
  big.addColorStop(1, "#9b5cff");
  g.fillStyle = big;
  let size = 150;
  g.font = `800 ${size}px ${FONT}`;
  while (g.measureText(recap.hours).width > W - 180 && size > 60) {
    size -= 6;
    g.font = `800 ${size}px ${FONT}`;
  }
  g.fillText(recap.hours, 90, 420 + size + 20);

  g.fillStyle = "#e8f1ff";
  g.font = `600 44px ${FONT}`;
  let y = 420 + size + 140;
  for (const line of recap.lines) {
    let text = line;
    while (g.measureText(text).width > W - 180 && text.length > 8) text = `${text.slice(0, -2)}…`;
    g.fillText(text, 90, y);
    y += 86;
  }
  g.fillStyle = "#a9b8d0";
  g.font = `500 34px ${FONT}`;
  g.fillText("arctv.org", 90, H - 90);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** The shareable recap: a short summary of the stats and a button that saves it as a picture (or shares it, where the browser can). Drawn here on the device; nothing is sent anywhere. */
export function StatsRecap({ stats }: { stats: WatchStats }) {
  const recap = recapOf(stats);
  const [note, setNote] = useState("");
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && typeof File !== "undefined" && navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] });
  if (!recap) return null;

  async function make(): Promise<Blob | null> {
    const blob = await recapImage(recap!);
    if (!blob) setNote("This browser can't make the picture.");
    return blob;
  }
  async function save() {
    const blob = await make();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "arctv-recap.png";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNote("Saved as arctv-recap.png.");
  }
  async function share() {
    const blob = await make();
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], "arctv-recap.png", { type: "image/png" })], title: "My ArcTV recap" });
    } catch {
      /* closed without sharing */
    }
  }
  return (
    <div className="stats__recap">
      <div className="t-title-md">{recap.heading}</div>
      <div className="stats__recaphours">{recap.hours}</div>
      <ul className="stats__recaplines t-body-sm c-text-2">
        {recap.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div className="stats__recapactions">
        <ArcButton text="Save as image" icon={<MdDownload />} compact onClick={() => void save()} />
        {canShare ? <ArcButton text="Share" icon={<MdIosShare />} compact onClick={() => void share()} /> : null}
      </div>
      <p className="t-label-sm c-text-3" role="status" style={{ margin: "8px 0 0" }}>{note || "The picture is made on your device; nothing is uploaded."}</p>
    </div>
  );
}
