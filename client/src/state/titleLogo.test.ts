import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ providers: [] as Array<{ id: string }> }));
const source = vi.hoisted(() => ({ loadDetails: vi.fn() }));
vi.mock("../domain/registry", () => ({ activeProviders: () => registry.providers, useProviders: (select: (s: { providers: unknown[] }) => unknown) => select({ providers: registry.providers }) }));
vi.mock("../domain/detailSource", () => source);
import { fetchTitleLogo } from "./titleLogo";

beforeEach(() => {
  source.loadDetails.mockReset();
  registry.providers = [];
});

describe("fetchTitleLogo", () => {
  it("asks nothing and remembers nothing while no addon is loaded yet", async () => {
    expect(await fetchTitleLogo("a", "MOVIE", "tt9000001")).toBeNull();
    expect(source.loadDetails).not.toHaveBeenCalled();
    registry.providers = [{ id: "a" }];
    source.loadDetails.mockResolvedValue({ logoUrl: "https://l/1.png" });
    expect(await fetchTitleLogo("a", "MOVIE", "tt9000001")).toBe("https://l/1.png");
  });

  it("asks once per title, sharing parallel asks and remembering the answer (a title with no logo too)", async () => {
    registry.providers = [{ id: "a" }];
    source.loadDetails.mockResolvedValue({ logoUrl: null });
    const [first, second] = await Promise.all([fetchTitleLogo("a", "MOVIE", "tt9000002"), fetchTitleLogo("a", "MOVIE", "tt9000002")]);
    expect(first).toBeNull();
    expect(second).toBeNull();
    await fetchTitleLogo("a", "MOVIE", "tt9000002");
    expect(source.loadDetails).toHaveBeenCalledTimes(1);
  });

  it("is null when the details cannot be loaded, and asks again next time", async () => {
    registry.providers = [{ id: "a" }];
    source.loadDetails.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ logoUrl: "https://l/3.png" });
    expect(await fetchTitleLogo("a", "TV_SHOW", "tt9000003")).toBeNull();
    expect(await fetchTitleLogo("a", "TV_SHOW", "tt9000003")).toBe("https://l/3.png");
  });
});
