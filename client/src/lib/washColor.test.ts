import { describe, expect, it } from "vitest";
import { washColor } from "./washColor";

const fill = (n: number, rgb: [number, number, number]) => Array.from({ length: n }).flatMap(() => [...rgb, 255]);

describe("washColor", () => {
  it("takes the colour of a coloured picture and lifts it to a clear level", () => {
    const c = washColor(fill(100, [100, 20, 20]))!;
    expect(c.r).toBe(200);
    expect(c.g).toBeLessThan(60);
    expect(c.b).toBeLessThan(60);
  });

  it("is not pulled off by black and white parts of the picture", () => {
    const data = [...fill(50, [0, 0, 0]), ...fill(50, [255, 255, 255]), ...fill(20, [20, 60, 160])];
    const c = washColor(data)!;
    expect(c.b).toBeGreaterThan(c.r);
    expect(c.b).toBe(200);
  });

  it("gives nothing for a grey or dark picture", () => {
    expect(washColor(fill(100, [120, 120, 120]))).toBeNull();
    expect(washColor(fill(100, [10, 10, 10]))).toBeNull();
    expect(washColor([])).toBeNull();
  });

  it("ignores see-through pixels", () => {
    expect(washColor([200, 30, 30, 0, 200, 30, 30, 0])).toBeNull();
  });
});
