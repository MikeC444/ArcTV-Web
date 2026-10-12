import { Dashboard } from "../dash/Dashboard";

export { ExternalPlayerSection } from "../dash/ExternalPlayers";

/** The developer dashboard (see `ui/dash`): only reachable by admins; read-only. */
export function AdminScreen() {
  return <Dashboard />;
}
