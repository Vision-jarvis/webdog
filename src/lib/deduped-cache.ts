/**
 * A tiny async cache that guarantees each key is loaded at most once per TTL and
 * deduplicates concurrent loads of the same key (a burst of callers awaiting the
 * same key share a single in-flight promise). Failed loads are never cached, so a
 * transient error doesn't poison the key.
 *
 * This is deliberately dependency-free so it can be unit-tested in isolation — it
 * backs the brand-logo lookups that would otherwise burn context.dev credits on
 * every render / dev hot-reload.
 */
export type DedupedCache<V> = {
  /** Return the cached value if fresh, join an in-flight load, or start a new one. */
  get(key: string, load: (key: string) => Promise<V>): Promise<V>;
  /** Drop all cached + in-flight entries. */
  clear(): void;
  /** Number of resolved entries currently cached. */
  readonly size: number;
};

export function createDedupedCache<V>(options: {
  ttlMs: number;
  /** Injectable clock for testing; defaults to `Date.now`. */
  now?: () => number;
}): DedupedCache<V> {
  const { ttlMs } = options;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: V; at: number }>();
  const inflight = new Map<string, Promise<V>>();

  async function get(key: string, load: (key: string) => Promise<V>): Promise<V> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const value = await load(key);
      cache.set(key, { value, at: now() });
      return value;
    })().finally(() => {
      inflight.delete(key);
    });

    inflight.set(key, promise);
    return promise;
  }

  return {
    get,
    clear() {
      cache.clear();
      inflight.clear();
    },
    get size() {
      return cache.size;
    },
  };
}
