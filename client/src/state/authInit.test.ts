import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";

let answer: (() => Promise<unknown>) | null = null;
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: vi.fn(() => (answer ? answer() : Promise.reject(new Error("no answer")))) };
});

const { useAuth } = await import("./auth");
const { globalKey } = await import("./persist");

const sam = { id: "u1", email: "sam@example.com", displayName: "Sam" };
const remember = () => localStorage.setItem(globalKey("lastUser"), JSON.stringify(sam));

beforeEach(() => {
  localStorage.clear();
  useAuth.setState({ status: "unknown", user: null, notice: null });
  answer = null;
});

describe("starting up", () => {
  it("signs a remembered user in at once, before the server has answered", () => {
    remember();
    answer = () => new Promise(() => undefined); // never answers
    void useAuth.getState().init();
    expect(useAuth.getState().status).toBe("signedIn");
    expect(useAuth.getState().user?.id).toBe("u1");
  });

  it("still asks the server, and keeps the user when it confirms", async () => {
    remember();
    answer = async () => ({ user: sam });
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe("signedIn");
  });

  it("signs the remembered user out when the server says the session is gone", async () => {
    remember();
    answer = () => Promise.reject(new ApiClientError(401, "unauthorized", "No session"));
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe("signedOut");
    expect(useAuth.getState().user).toBeNull();
  });

  it("keeps the remembered user when the server can't be reached", async () => {
    remember();
    answer = () => Promise.reject(new ApiClientError(0, "network", "offline"));
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe("signedIn");
  });

  it("waits for the server when nobody is remembered", () => {
    answer = () => new Promise(() => undefined);
    void useAuth.getState().init();
    expect(useAuth.getState().status).toBe("unknown");
  });
});
