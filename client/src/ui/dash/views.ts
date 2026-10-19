export type ViewId = "overview" | "watching" | "users" | "playback" | "downloads" | "popups" | "addons" | "versions" | "crashes";

export const VIEWS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "The numbers that matter, on one screen" },
  { id: "watching", label: "Watching", hint: "Who is watching right now, and what" },
  { id: "users", label: "Users", hint: "Every account, with filters and a detail panel" },
  { id: "playback", label: "Playback", hint: "How viewings end, by device, player and quality" },
  { id: "downloads", label: "Downloads", hint: "Download use and other players" },
  { id: "popups", label: "App popups", hint: "Who the Mac and Windows app popups reach, and what they do" },
  { id: "addons", label: "Addons", hint: "What people have installed" },
  { id: "versions", label: "Versions", hint: "App versions and websites in use" },
  { id: "crashes", label: "Crashes", hint: "Crash reports the apps send on their next start" },
];
