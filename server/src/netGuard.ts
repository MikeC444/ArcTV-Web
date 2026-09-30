import dns from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF defence for the addon fetch fallback. The check happens at *connect
 * time* (inside the DNS lookup used by the socket), so a hostname that
 * resolves to a public address when we validate it but to 127.0.0.1 when we
 * connect (DNS rebinding) is still refused.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT / shared address space
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function expandV6(ip: string): number[] | null {
  let address = ip.toLowerCase().split("%")[0] ?? "";
  // embedded dotted quad (::ffff:1.2.3.4)
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = dotted[1] as string;
    const n = ipv4ToInt(v4);
    address = address.replace(v4, `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((g) => parseInt(g || "0", 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true; // unparseable → refuse
  const [a, b, c, d, e, f, g6, h] = g as [number, number, number, number, number, number, number, number];
  if (g.every((x) => x === 0)) return true; // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g6 === 0 && h === 1) return true; // ::1
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible, and NAT64 (64:ff9b::/96) embed a v4 address → judge that
  const embedsV4 = (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) || (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0);
  if (embedsV4) return isPrivateV4(`${g6 >> 8}.${g6 & 255}.${h >> 8}.${h & 255}`);
  if (a === 0x2002) return true; // 6to4 — can tunnel to private v4; not worth allowing
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** `lookup` implementation for undici's `connect` options that refuses private destinations. */
export function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      const list = addresses as dns.LookupAddress[];
      if (!allowPrivate && list.some((entry) => isPrivateAddress(entry.address))) {
        const blocked: NodeJS.ErrnoException = new Error("Blocked: destination is not a public address");
        blocked.code = "EBLOCKED";
        return callback(blocked, []);
      }
      if (options.all) return callback(null, list);
      const first = list[0];
      return first ? callback(null, first.address, first.family) : callback(new Error("No address"), []);
    });
  };
}
