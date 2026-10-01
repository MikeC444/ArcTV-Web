import { describe, expect, it } from "vitest";
import { mergeCast } from "./castMerge";

const tmdb = [
  { name: "Tim Robbins", character: "Andy Dufresne", photo: "https://image.tmdb.org/t/p/w185/a.jpg" },
  { name: "Morgan Freeman", character: "Ellis Boyd 'Red' Redding", photo: null },
  { name: "Zoë Saldaña", character: "Neytiri", photo: "https://image.tmdb.org/t/p/w185/z.jpg" },
];

describe("mergeCast", () => {
  it("adds photos and characters to the addon's names, keeping its order", () => {
    const merged = mergeCast([{ name: "Morgan Freeman" }, { name: "tim robbins" }, { name: "Unknown Actor" }], tmdb);
    expect(merged.map((m) => m.name)).toEqual(["Morgan Freeman", "tim robbins", "Unknown Actor"]);
    expect(merged[1]).toMatchObject({ photoUrl: "https://image.tmdb.org/t/p/w185/a.jpg", role: "Andy Dufresne" });
    expect(merged[0]).toMatchObject({ role: "Ellis Boyd 'Red' Redding", photoUrl: null });
    expect(merged[2]).toEqual({ name: "Unknown Actor" });
  });
  it("matches names ignoring accents and punctuation", () => {
    expect(mergeCast([{ name: "Zoe Saldana" }], tmdb)[0]?.photoUrl).toBe("https://image.tmdb.org/t/p/w185/z.jpg");
  });
  it("never overwrites what the addon sent", () => {
    const addon = [{ name: "Tim Robbins", role: "Andy", photoUrl: "https://cinemeta.example/tim.jpg" }];
    expect(mergeCast(addon, tmdb)[0]).toEqual(addon[0]);
  });
  it("uses TMDB's list when the addon sent none, and leaves things alone when TMDB sent none", () => {
    expect(mergeCast([], tmdb)).toHaveLength(3);
    const addon = [{ name: "A" }];
    expect(mergeCast(addon, [])).toBe(addon);
  });
});
