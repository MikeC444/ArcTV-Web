/**
 * A small, careful TMDB (themoviedb.org) v3 client for the built-in catalog addon: answers are cached (and shared by everyone
 * asking for the same thing at the same time), the number of requests in flight is capped so a cold start doesn't trip TMDB's
 * rate limit, and 429 / 5xx / network errors are retried a couple of times.
 */
export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export interface TmdbOptions {
  /** A v3 API key, or a v4 "read access token" (a JWT, sent as a bearer token). */
  apiKey: string;
  baseUrl: string;
  imageBaseUrl: string;
  fetchImpl?: typeof fetch;
  /** Requests allowed in flight at once. */
  concurrency?: number;
  /** Default time an answer is reused. */
  ttlMs?: number;
  /** Most answers kept. */
  maxEntries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface Entry {
  until: number;
  promise: Promise<unknown>;
}

export class TmdbClient {
  private readonly cache = new Map<string, Entry>();
  private readonly waiting: Array<() => void> = [];
  private active = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly concurrency: number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: TmdbOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.concurrency = options.concurrency ?? 12;
    this.ttlMs = options.ttlMs ?? 30 * 60_000;
    this.maxEntries = options.maxEntries ?? 2000;
    this.retryDelayMs = options.retryDelayMs ?? 400;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  /** `https://image.tmdb.org/t/p/w500/abc.jpg` for a TMDB image path such as `/abc.jpg`. */
  image(path: string | null | undefined, size: string): string | undefined {
    return path ? `${this.options.imageBaseUrl}/${size}${path}` : undefined;
  }

  get<T>(path: string, params: Record<string, string | number> = {}, ttlMs: number = this.ttlMs): Promise<T> {
    const pairs: Array<[string, string]> = Object.entries(params).map(([k, v]) => [k, String(v)]);
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const query = new URLSearchParams(pairs);
    const key = `${path}?${query}`;
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.until > now) return hit.promise as Promise<T>;

    const promise = this.request<T>(path, query);
    this.cache.set(key, { until: now + ttlMs, promise });
    promise.catch(() => {
      if (this.cache.get(key)?.promise === promise) this.cache.delete(key); // failures are never remembered
    });
    if (this.cache.size > this.maxEntries) this.evict(now);
    return promise;
  }

  private evict(now: number): void {
    for (const [key, entry] of this.cache) if (entry.until <= now) this.cache.delete(key);
    // still too many: drop the oldest inserted ones
    for (const key of this.cache.keys()) {
      if (this.cache.size <= this.maxEntries * 0.9) break;
      this.cache.delete(key);
    }
  }

  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async request<T>(path: string, query: URLSearchParams): Promise<T> {
    const isBearer = this.options.apiKey.startsWith("eyJ");
    const url = new URL(`${this.options.baseUrl}${path}`);
    query.forEach((value, name) => url.searchParams.set(name, value));
    if (!isBearer) url.searchParams.set("api_key", this.options.apiKey);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (isBearer) headers.Authorization = `Bearer ${this.options.apiKey}`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
      try {
        const response = await this.slot(() => this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) }));
        if (response.ok) return (await response.json()) as T;
        if (response.status === 429 || response.status >= 500) {
          lastError = new TmdbError(`TMDB answered ${response.status}`, response.status);
          continue;
        }
        throw new TmdbError(`TMDB answered ${response.status}`, response.status); // 401 (bad key), 404 (no such title) — retrying won't change it
      } catch (error) {
        if (error instanceof TmdbError && error.status < 500 && error.status !== 429) throw error;
        lastError = error instanceof TmdbError ? error : new TmdbError("TMDB could not be reached", 0);
      }
    }
    throw lastError instanceof TmdbError ? lastError : new TmdbError("TMDB could not be reached", 0);
  }
}
