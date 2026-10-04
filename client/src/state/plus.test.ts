import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";

const calls: Array<{ path: string; method: string; body?: unknown }> = [];
let respond: (path: string, method: string) => unknown = () => undefined;
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? "GET";
      calls.push({ path, method, body: options.body });
      const result = respond(path, method);
      if (result instanceof Error) throw result;
      return result;
    }),
  };
});

const { usePlus, watchForPurchase } = await import("./plus");
const { hasPlusNow } = await import("./plusAccess");
const { hydrateAll, resetAllStores } = await import("./sync");

const status = (over: Record<string, unknown> = {}) => ({ active: false, plan: null, validUntil: null, cancelAtPeriodEnd: false, paywall: true, ...over });

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  respond = () => undefined;
  resetAllStores();
  vi.useRealTimers();
});

describe("ArcTV Plus status", () => {
  it("has no Plus until the backend says so, and guests never have it", async () => {
    expect(hasPlusNow()).toBe(false);
    expect(await usePlus.getState().pull()).toBe(false); // no signed-in user: nothing is asked
    expect(calls).toHaveLength(0);
  });

  it("follows what the backend answers: early access for everyone, then paid-only once the paywall is on", async () => {
    hydrateAll("u1");
    respond = () => status({ active: true, plan: "early_access", paywall: false });
    expect(await usePlus.getState().pull()).toBe(true);
    expect(hasPlusNow()).toBe(true);
    expect(usePlus.getState().paywall).toBe(false);

    respond = () => status();
    await usePlus.getState().pull();
    expect(hasPlusNow()).toBe(false);
    expect(usePlus.getState().paywall).toBe(true);

    respond = () => status({ active: true, plan: "yearly", validUntil: "2099-01-01T00:00:00.000Z" });
    await usePlus.getState().pull();
    expect(hasPlusNow()).toBe(true);
    expect(usePlus.getState().plan).toBe("yearly");
  });

  it("keeps the last known status when it can't be read, and remembers it for the next launch", async () => {
    hydrateAll("u1");
    respond = () => status({ active: true, plan: "monthly", validUntil: "2099-01-01T00:00:00.000Z" });
    await usePlus.getState().pull();
    respond = () => new ApiClientError(0, "network", "offline");
    expect(await usePlus.getState().pull()).toBe(false);
    expect(hasPlusNow()).toBe(true);

    resetAllStores(); // the next launch
    expect(hasPlusNow()).toBe(false);
    hydrateAll("u1");
    expect(hasPlusNow()).toBe(true); // shown at once, before the fresh answer
  });

  it("never carries one account's Plus into another", async () => {
    hydrateAll("u1");
    respond = () => status({ active: true, plan: "lifetime" });
    await usePlus.getState().pull();
    resetAllStores();
    hydrateAll("u2");
    expect(hasPlusNow()).toBe(false);
  });

  it("starts a checkout for the chosen plan and returns the payment page's URL", async () => {
    hydrateAll("u1");
    respond = () => ({ url: "https://checkout.stripe.com/c/pay_1" });
    expect(await usePlus.getState().checkout("lifetime")).toBe("https://checkout.stripe.com/c/pay_1");
    expect(calls.at(-1)).toEqual({ path: "/user/plus/checkout", method: "POST", body: { plan: "lifetime" } });
  });
});

describe("cancelling a subscription", () => {
  it("asks the backend, then shows Plus as ending rather than gone", async () => {
    hydrateAll("u1");
    respond = () => status({ active: true, plan: "monthly", validUntil: "2099-01-01T00:00:00.000Z" });
    await usePlus.getState().pull();
    expect(usePlus.getState().cancelAtPeriodEnd).toBe(false);

    respond = () => status({ active: true, plan: "monthly", validUntil: "2099-01-01T00:00:00.000Z", cancelAtPeriodEnd: true });
    await usePlus.getState().cancelSubscription();
    expect(calls.at(-1)).toEqual({ path: "/user/plus/cancel", method: "POST", body: {} });
    expect(usePlus.getState()).toMatchObject({ active: true, plan: "monthly", cancelAtPeriodEnd: true });
    expect(hasPlusNow()).toBe(true);
  });

  it("leaves the status alone when the backend refuses", async () => {
    hydrateAll("u1");
    respond = () => status({ active: true, plan: "yearly", validUntil: "2099-01-01T00:00:00.000Z" });
    await usePlus.getState().pull();
    respond = () => new ApiClientError(500, "server_error", "nope");
    await expect(usePlus.getState().cancelSubscription()).rejects.toBeInstanceOf(ApiClientError);
    expect(usePlus.getState().cancelAtPeriodEnd).toBe(false);
  });
});

describe("watching for a purchase", () => {
  it("asks again until Plus is on, then stops", async () => {
    vi.useFakeTimers();
    hydrateAll("u1");
    let answers = 0;
    respond = () => status({ active: ++answers >= 3, plan: answers >= 3 ? "monthly" : null });
    const stop = watchForPurchase({ everyMs: 1000, forMs: 60_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hasPlusNow()).toBe(true);
    const asked = calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.length).toBe(asked); // stopped by itself
    stop();
  });

  it("gives up after its time is up", async () => {
    vi.useFakeTimers();
    hydrateAll("u1");
    respond = () => status();
    watchForPurchase({ everyMs: 1000, forMs: 5000 });
    await vi.advanceTimersByTimeAsync(30_000);
    const asked = calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.length).toBe(asked);
    expect(hasPlusNow()).toBe(false);
  });
});
