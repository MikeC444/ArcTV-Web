import { describe, expect, it, vi } from "vitest";
import { createEpgService, type FetchListings } from "../src/epg/epgService.js";
import { buildChannelIndex, idToName, matchChannel, normalizeChannelName } from "../src/epg/match.js";
import { decodeEntities, parseXmltv, parseXmltvTime } from "../src/epg/xmltv.js";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

const NOW_MS = Date.UTC(2026, 9, 12, 12, 0, 0); // 12:00 UTC
const stamp = (hoursFromNow: number) => {
  const d = new Date(NOW_MS + hoursFromNow * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00 +0000`;
};
const programme = (channel: string, from: number, to: number, title: string, extra = "") => `<programme channel="${channel}" start="${stamp(from)}" stop="${stamp(to)}">\n <title lang="en">${title}</title>${extra}\n</programme>`;
const FILE = `<?xml version="1.0" encoding="UTF-8" ?>
<tv>
  <channel id="BBC.One.Lon.HD.uk"><icon src="https://img/bbc1.png" /><display-name lang="en">BBC One London</display-name></channel>
  <channel id="ITV1.uk"><display-name lang="en">ITV1</display-name><display-name>ITV 1 HD</display-name></channel>
  <channel id="Empty.uk"><display-name>Nothing On</display-name></channel>
  ${programme("BBC.One.Lon.HD.uk", -1, 0, "Earlier News")}
  ${programme("BBC.One.Lon.HD.uk", 0, 1, "Pawn &amp; Stars", `\n <sub-title>Episode &#65;</sub-title>\n <desc>${"x".repeat(400)}</desc>\n <category>Factual</category>`)}
  ${programme("BBC.One.Lon.HD.uk", 1, 2, "Late Film")}
  ${programme("ITV1.uk", 0, 2, "Soap")}
  ${programme("ITV1.uk", -30, -20, "Long Ago")}
  ${programme("ITV1.uk", 60, 70, "Far Future")}
</tv>`;

async function* inPieces(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
const window = { from: NOW_MS / 1000 - 3 * 3600, to: NOW_MS / 1000 + 40 * 3600 };

describe("XMLTV reading", () => {
  it("reads times with their offset", () => {
    expect(parseXmltvTime("20261012120000 +0000")).toBe(NOW_MS / 1000);
    expect(parseXmltvTime("20261012130000 +0100")).toBe(NOW_MS / 1000);
    expect(parseXmltvTime("20261012115000 -0010")).toBe(NOW_MS / 1000); // 11:50 at 10 minutes behind UTC is 12:00 UTC
    expect(parseXmltvTime("nonsense")).toBeNull();
  });
  it("decodes the entities XMLTV uses", () => {
    expect(decodeEntities("Pawn &amp; Stars &lt;3 &#65; &#x42; &quot;q&quot; &unknown;")).toBe('Pawn & Stars <3 A B "q" &unknown;');
  });
  it("reads channels and the programmes in the window, however the file is cut into pieces", async () => {
    for (const size of [7, 64, 100_000]) {
      const data = await parseXmltv(inPieces(FILE, size), window);
      expect([...data.channels.keys()].sort()).toEqual(["BBC.One.Lon.HD.uk", "ITV1.uk", "Empty.uk"].sort());
      expect(data.channels.get("BBC.One.Lon.HD.uk")).toEqual({ id: "BBC.One.Lon.HD.uk", names: ["BBC One London"], icon: "https://img/bbc1.png" });
      expect(data.programmes.get("ITV1.uk")?.map((p) => p.title)).toEqual(["Soap"]); // the one far in the past and the one days ahead are left out
      const bbc = data.programmes.get("BBC.One.Lon.HD.uk")!;
      expect(bbc.map((p) => p.title)).toEqual(["Earlier News", "Pawn & Stars", "Late Film"]);
      expect(bbc[1]).toMatchObject({ subtitle: "Episode A", category: "Factual" });
      expect(bbc[1]!.desc!.length).toBeLessThanOrEqual(260);
      expect(bbc[1]!.desc!.endsWith("…")).toBe(true);
    }
  });
  it("reads bytes as well as text, including characters split across pieces", async () => {
    const bytes = Buffer.from(FILE.replace("Soap", "Café ☕"), "utf-8");
    async function* chunks() {
      for (let i = 0; i < bytes.length; i += 5) yield bytes.subarray(i, i + 5);
    }
    const data = await parseXmltv(chunks(), window);
    expect(data.programmes.get("ITV1.uk")?.[0]?.title).toBe("Café ☕");
  });
  it("refuses something that is not XMLTV and never closes its element", async () => {
    async function* endless() {
      yield '<programme channel="x" start="20261012120000 +0000" stop="20261012130000 +0000">';
      for (let i = 0; i < 20; i++) yield "y".repeat(1024 * 1024);
    }
    await expect(parseXmltv(endless(), window)).rejects.toThrow(/not valid XMLTV/);
  });
});

describe("matching an addon's channel names to the listings", () => {
  it("drops delivery words, symbols and accents", () => {
    expect(normalizeChannelName("📺 BBC One HD (1080p)")).toBe("bbc one");
    expect(normalizeChannelName("Sky Sports F1 [UHD]")).toBe("sky sports f1");
    expect(normalizeChannelName("Channel 4 +1")).toBe("channel 4 plus1");
    expect(normalizeChannelName("Télé-Loisirs & Co")).toBe("tele loisirs and co");
    expect(normalizeChannelName("HD")).toBe("");
    expect(idToName("BBC.One.Lon.HD.uk")).toBe("bbc one lon");
  });
  it("finds the same channel, or the plainest one that starts with the name, and not a vague guess", async () => {
    const data = await parseXmltv(inPieces(FILE, 1000), window);
    const index = buildChannelIndex(data.channels.values(), (id) => (data.programmes.get(id)?.length ?? 0) > 0);
    expect(matchChannel(index, "ITV1 HD")?.id).toBe("ITV1.uk");
    expect(matchChannel(index, "ITV 1")?.id).toBe("ITV1.uk");
    expect(matchChannel(index, "BBC One")?.id).toBe("BBC.One.Lon.HD.uk");
    expect(matchChannel(index, "ITV 1 (1080p)")?.id).toBe("ITV1.uk");
    expect(matchChannel(index, "BBC")).toBeNull(); // too short to guess from
    expect(matchChannel(index, "Nothing On")).toBeNull(); // nothing scheduled, so no use
    expect(matchChannel(index, "Unknown Channel")).toBeNull();
    expect(matchChannel(index, "HD")).toBeNull();
  });
});

describe("choosing between regional versions and prefixes", () => {
  const chan = (id: string, ...names: string[]) => ({ id, names, icon: null });
  const index = buildChannelIndex(
    [chan("BBC.One.CI.HD.uk", "BBC One Channel Islands"), chan("BBC.One.Lon.HD.uk", "BBC One London"), chan("BBC.One.Wal.HD.uk", "BBC One Wales"), chan("U.and.Dave.HD.uk", "U&Dave HD"), chan("Film4+1.uk", "Film4 +1")],
    () => true,
  );
  it("prefers the London version of a regional channel, not the first one alphabetically", () => {
    expect(matchChannel(index, "BBC One HD")?.id).toBe("BBC.One.Lon.HD.uk");
    expect(matchChannel(index, "BBC One Wales")?.id).toBe("BBC.One.Wal.HD.uk");
  });
  it("finds a channel whose listing name has a prefix, and keeps +1 channels apart", () => {
    expect(matchChannel(index, "Dave")?.id).toBe("U.and.Dave.HD.uk");
    expect(matchChannel(index, "Film4 +1")?.id).toBe("Film4+1.uk");
    expect(matchChannel(index, "Film4")).toBeNull(); // only the +1 is listed: not the same channel
  });
});

describe("the listings service", () => {
  const asBytes = (text: string): FetchListings => vi.fn(async () => inPieces(text, 4096));

  it("matches the channels asked about and returns their programmes for the window", async () => {
    const service = createEpgService({ fetchListings: asBytes(FILE), now: () => NOW_MS });
    const guide = await service.guide("UK1", [{ key: "a", name: "BBC One HD" }, { key: "b", name: "ITV1" }, { key: "c", name: "Mystery" }], NOW_MS / 1000, NOW_MS / 1000 + 3 * 3600);
    expect(guide.unmatched).toEqual(["c"]);
    expect(guide.channels.map((c) => [c.key, c.epgId, c.programmes.map((p) => p.t)])).toEqual([
      ["a", "BBC.One.Lon.HD.uk", ["Pawn & Stars", "Late Film"]],
      ["b", "ITV1.uk", ["Soap"]],
    ]);
    expect(guide.channels[0]!.programmes[0]).toMatchObject({ st: "Episode A", c: "Factual" });
    expect(guide.channels[0]!.icon).toBe("https://img/bbc1.png");
    expect(guide.from).toBe(NOW_MS / 1000);
  });

  it("limits how far back and how long a request may reach", async () => {
    const service = createEpgService({ fetchListings: asBytes(FILE), now: () => NOW_MS });
    const guide = await service.guide("UK1", [{ key: "a", name: "ITV1" }], 0, 9_999_999_999);
    expect(guide.from).toBe(NOW_MS / 1000 - 6 * 3600);
    expect(guide.to - guide.from).toBe(36 * 3600);
  });

  it("reads a country's file once while it is fresh, and shares a read already in progress", async () => {
    const fetchListings = asBytes(FILE);
    const service = createEpgService({ fetchListings, now: () => NOW_MS });
    await Promise.all([service.guide("UK1", [{ key: "a", name: "ITV1" }]), service.guide("UK1", [{ key: "a", name: "ITV1" }])]);
    await service.guide("UK1", [{ key: "a", name: "ITV1" }]);
    expect(fetchListings).toHaveBeenCalledTimes(1);
  });

  it("reads it again when it is old, and serves the old copy when the host is down", async () => {
    let clock = NOW_MS;
    const fetchListings = vi.fn<FetchListings>(async () => inPieces(FILE, 4096));
    const service = createEpgService({ fetchListings, now: () => clock });
    await service.guide("UK1", [{ key: "a", name: "ITV1" }]);
    clock += 4 * 3600_000;
    await service.guide("UK1", [{ key: "a", name: "ITV1" }]);
    expect(fetchListings).toHaveBeenCalledTimes(2);
    clock += 4 * 3600_000;
    fetchListings.mockRejectedValue(new Error("down"));
    expect((await service.guide("UK1", [{ key: "a", name: "ITV1" }])).channels).toHaveLength(1);
    clock += 30 * 3600_000;
    await expect(service.guide("UK1", [{ key: "a", name: "ITV1" }])).rejects.toThrow("down");
  });

  it("only knows the countries it lists", async () => {
    const service = createEpgService({ fetchListings: asBytes(FILE), now: () => NOW_MS });
    await expect(service.guide("../../etc", [{ key: "a", name: "ITV1" }])).rejects.toThrow("Unknown guide source");
  });
});

describe("the guide routes", () => {
  const epg = { guide: vi.fn(async () => ({ source: "UK1", from: 1, to: 2, updatedAt: 3, channels: [], unmatched: ["a"] })) };
  async function signedIn() {
    const backend = createMockBackend();
    backend.addUser("sam@example.com", "password-1234");
    const client = agentFor(appWith(backend.fetch, {}, { epg }));
    await client.post("/api/auth/login").send({ email: "sam@example.com", password: "password-1234" });
    return client;
  }
  const body = { source: "UK1", channels: [{ key: "a", name: "ITV1" }] };

  it("lists the countries without a sign-in", async () => {
    const client = agentFor(appWith(createMockBackend().fetch, {}, { epg }));
    const res = await client.get("/api/epg/sources");
    expect(res.status).toBe(200);
    expect(res.body.sources[0]).toEqual({ id: "UK1", label: "United Kingdom" });
  });
  it("needs a sign-in for the guide", async () => {
    const client = agentFor(appWith(createMockBackend().fetch, {}, { epg }));
    expect((await client.post("/api/epg/guide").send(body)).status).toBe(401);
  });
  it("answers a signed-in request from the service", async () => {
    const client = await signedIn();
    const res = await client.post("/api/epg/guide").send({ ...body, from: 100, to: 200 });
    expect(res.status).toBe(200);
    expect(res.body.unmatched).toEqual(["a"]);
    expect(epg.guide).toHaveBeenLastCalledWith("UK1", body.channels, 100, 200);
  });
  it("refuses a country it does not list, no channels, too many channels and junk", async () => {
    const client = await signedIn();
    expect((await client.post("/api/epg/guide").send({ ...body, source: "XX9" })).status).toBe(400);
    expect((await client.post("/api/epg/guide").send({ ...body, source: "../x" })).status).toBe(400);
    expect((await client.post("/api/epg/guide").send({ ...body, channels: [] })).status).toBe(400);
    expect((await client.post("/api/epg/guide").send({ ...body, channels: Array.from({ length: 301 }, (_, i) => ({ key: `k${i}`, name: "n" })) })).status).toBe(400);
    expect((await client.post("/api/epg/guide").send({ source: "UK1" })).status).toBe(400);
  });
  it("says so plainly when the listings can't be loaded", async () => {
    const client = await signedIn();
    epg.guide.mockRejectedValueOnce(new Error("boom with secrets"));
    const res = await client.post("/api/epg/guide").send(body);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secrets");
  });
});
