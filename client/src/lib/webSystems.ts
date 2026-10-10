/** One row of the developer panel's web-users card: people (and signed-in browsers) on a system, as the backend names it. */
export interface WebSystem {
  system: string;
  users: number;
  devices: number;
}

const LABELS: Record<string, string> = {
  Android: "Android (phones, tablets)",
  iOS: "iOS (iPhone, iPad)",
  macOS: "macOS (Mac)",
  Windows: "Windows",
  Linux: "Linux",
  ChromeOS: "ChromeOS",
  Other: "Other or unknown",
};
export const webSystemLabel = (system: string): string => LABELS[system] ?? system;
