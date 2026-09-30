/**
 * Everything this app keeps in the browser is namespaced per signed-in user
 * (`mtv:v1:<userId>:…`). That is what guarantees a second account signing in on
 * the same browser can never see — or push — the first account's cached data or
 * queued offline writes; explicit sign-out additionally wipes the namespace.
 */
const PREFIX = "mtv:v1:";

export const userKey = (userId: string, name: string): string => `${PREFIX}${userId}:${name}`;
export const globalKey = (name: string): string => `${PREFIX}${name}`;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked (private mode) — the app still works from memory */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Removes every key that belongs to one user (sign-out). */
export function wipeUser(userId: string): void {
  try {
    const prefix = `${PREFIX}${userId}:`;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/**
 * A small durable outbox: writes that couldn't reach the server yet, keyed by their natural key so a later change to
 * the same item replaces the earlier one (PendingChangeStore.kt).
 */
export class Outbox<T> {
  constructor(
    private readonly userId: string,
    private readonly name: string,
  ) {}
  private get key() {
    return userKey(this.userId, `outbox:${this.name}`);
  }
  all(): Record<string, T> {
    return readJson<Record<string, T>>(this.key, {});
  }
  put(naturalKey: string, value: T): void {
    writeJson(this.key, { ...this.all(), [naturalKey]: value });
  }
  remove(naturalKey: string): void {
    const current = this.all();
    if (naturalKey in current) {
      delete current[naturalKey];
      writeJson(this.key, current);
    }
  }
  clear(): void {
    removeKey(this.key);
  }
  get size(): number {
    return Object.keys(this.all()).length;
  }
}
