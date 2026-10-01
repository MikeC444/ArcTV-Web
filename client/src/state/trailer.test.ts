import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let answer: { youtubeVideoId: string | null } | Error = { youtubeVideoId: "abc123" };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string) => {
      calls.push(path);
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
});

const { fetchTrailerId, resetTrailerCache } = await import("./trailer");
const film = { title: "Run Hide Fight", type: "MOVIE" as const, year: 2020 };

beforeEach(() => {
  calls.length = 0;
  answer = { youtubeVideoId: "abc123" };
  resetTrailerCache();
});

describe("trailer lookup", () => {
  it("asks once for a title, however often and however fast it is asked", async () => {
    const [a, b] = await Promise.all([fetchTrailerId(film), fetchTrailerId(film)]);
    expect([a, b]).toEqual(["abc123", "abc123"]);
    expect(await fetchTrailerId(film)).toBe("abc123");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("title=Run+Hide+Fight");
    expect(calls[0]).toContain("year=2020");
  });
  it("answers null when there is no trailer, and asks again after a failure", async () => {
    answer = { youtubeVideoId: null };
    expect(await fetchTrailerId(film)).toBeNull();
    resetTrailerCache();
    answer = new Error("offline");
    expect(await fetchTrailerId(film)).toBeNull();
    answer = { youtubeVideoId: "later" };
    expect(await fetchTrailerId(film)).toBe("later");
  });
});
