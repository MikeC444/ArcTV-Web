/** Accepts the many shapes an addon URL is shared in (stremio:// deep links, bare hosts, missing manifest.json). */
export function normalizeManifestUrl(input: string): string {
  let url = input.trim();
  if (url.toLowerCase().startsWith("stremio://")) url = "https://" + url.slice("stremio://".length);
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const last = url.split("?")[0]!.split("#")[0]!.split("/").pop() ?? "";
  if (last.toLowerCase() !== "manifest.json") url = url.replace(/\/+$/, "") + "/manifest.json";
  return url;
}

/** The addon's resource base URL: the manifest URL with `manifest.json` stripped. */
export function resourceBase(manifestUrl: string): string {
  return manifestUrl.replace(/manifest\.json$/i, "").replace(/\/+$/, "");
}

/** URLEncoder with "+" → "%20" (path segments need real %20). */
export function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
