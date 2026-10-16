import { describe, expect, it } from "vitest";
import { formatMoney, lifetimeInYears, parsePrices, savingPercent, yearlyPerDay, yearlyPerMonth, type PlanPrices } from "./plus";

const prices = (monthly: number, yearly: number, lifetime = 9999, currency = "gbp"): PlanPrices => ({
  monthly: { amount: monthly, currency },
  yearly: { amount: yearly, currency },
  lifetime: { amount: lifetime, currency },
});

describe("formatMoney", () => {
  it("formats the smallest unit as a currency, dropping .00 on whole amounts", () => {
    expect(formatMoney(499, "gbp", "en-GB")).toBe("£4.99");
    expect(formatMoney(3000, "gbp", "en-GB")).toBe("£30");
    expect(formatMoney(399, "usd", "en-US")).toBe("$3.99");
  });
  it("does not divide a zero-decimal currency, and gives null for a code it does not know", () => {
    expect(formatMoney(500, "jpy", "en-US")).toBe("¥500");
    expect(formatMoney(500, "not-a-currency", "en-US")).toBeNull();
  });
});

describe("the yearly comparison", () => {
  it("works out the monthly equivalent, the saving and the per-day cost from the real prices", () => {
    const p = prices(499, 3999);
    expect(yearlyPerMonth(p.yearly)).toBe(333);
    expect(savingPercent(p)).toBe(33); // 1 - 333.25/499
    expect(yearlyPerDay(p.yearly)).toBe(11);
  });
  it("shows no saving unless yearly really is cheaper per month, or when the currencies differ", () => {
    expect(savingPercent(prices(499, 5988))).toBeNull(); // exactly 12 x monthly
    expect(savingPercent(prices(499, 7000))).toBeNull(); // dearer
    expect(savingPercent({ ...prices(499, 3999), yearly: { amount: 3999, currency: "usd" } })).toBeNull();
    expect(savingPercent(prices(0, 3999))).toBeNull();
  });
  it("says how many years of yearly Lifetime costs, only within one currency", () => {
    expect(lifetimeInYears(prices(499, 3999, 9999))).toBe(2.5);
    expect(lifetimeInYears({ ...prices(499, 3999), lifetime: { amount: 9999, currency: "usd" } })).toBeNull();
  });
});

describe("parsePrices", () => {
  it("accepts all three plans and lower-cases the currency", () => {
    expect(parsePrices({ monthly: { amount: 1, currency: "GBP" }, yearly: { amount: 2, currency: "GBP" }, lifetime: { amount: 3, currency: "GBP" } })?.monthly.currency).toBe("gbp");
  });
  it("rejects anything incomplete or malformed", () => {
    expect(parsePrices(null)).toBeNull();
    expect(parsePrices("x")).toBeNull();
    expect(parsePrices({ monthly: { amount: 1, currency: "gbp" } })).toBeNull();
    expect(parsePrices({ monthly: { amount: 0, currency: "gbp" }, yearly: { amount: 2, currency: "gbp" }, lifetime: { amount: 3, currency: "gbp" } })).toBeNull();
    expect(parsePrices({ monthly: { amount: 1, currency: "pounds" }, yearly: { amount: 2, currency: "gbp" }, lifetime: { amount: 3, currency: "gbp" } })).toBeNull();
  });
});
