import { describe, expect, it } from "vitest";
import type { Stream } from "../domain/types";
import { getHandoff, putHandoff } from "./streamHandoff";

const stream = (id: string) => ({ id }) as Stream;

describe("streamHandoff", () => {
  it("the source just picked is found again by its id, also on a retry", () => {
    putHandoff(stream("a"));
    expect(getHandoff("a")?.id).toBe("a");
    expect(getHandoff("a")?.id).toBe("a");
  });
  it("a different source never gets it", () => {
    putHandoff(stream("a"));
    expect(getHandoff("b")).toBeNull();
    expect(getHandoff("")).toBeNull();
  });
  it("the latest pick replaces the earlier one", () => {
    putHandoff(stream("a"));
    putHandoff(stream("b"));
    expect(getHandoff("a")).toBeNull();
    expect(getHandoff("b")?.id).toBe("b");
  });
});
