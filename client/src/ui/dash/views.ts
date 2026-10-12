export type ViewId = "overview" | "users" | "playback" | "downloads" | "addons" | "versions";

export const VIEWS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "The numbers that matter, on one screen" },
  { id: "users", label: "Users", hint: "Every account, with filters and a detail panel" },
  { id: "playback", label: "Playback", hint: "How viewings end, by device, player and quality" },
  { id: "downloads", label: "Downloads", hint: "Download use and other players" },
  { id: "addons", label: "Addons", hint: "What people have installed" },
  { id: "versions", label: "Versions", hint: "App versions and websites in use" },
];
