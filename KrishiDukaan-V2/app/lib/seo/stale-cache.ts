/**
 * A cached async loader for server data that public pages are built from.
 *
 *  - Fresh for `ttlMs`, then the next call reloads.
 *  - Concurrent calls while loading share ONE load.
 *  - A failed reload serves the last good value instead of failing.
 *  - With no good value yet, the error propagates. It is never turned into an
 *    empty result.
 *
 * The last rule is the important one for SEO pages. An empty list makes a page
 * call notFound(), and that 404 is cached by the CDN and by ISR. A thrown
 * render is a 5xx, which is not cached, and ISR keeps the previous good page.
 * See stores-server.getAllStores for the 404s this caused.
 */
export function staleWhileErrorCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
  opts: { now?: () => number; onStaleServe?: (err: unknown) => void } = {},
): () => Promise<T> {
  const now = opts.now ?? Date.now;
  let good: { value: T; at: number } | null = null;
  let inflight: Promise<T> | null = null;

  return async () => {
    if (good && now() - good.at < ttlMs) return good.value;
    if (!inflight) {
      inflight = load()
        .then((value) => {
          good = { value, at: now() };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      return await inflight;
    } catch (err) {
      if (good) {
        opts.onStaleServe?.(err);
        return good.value;
      }
      throw err;
    }
  };
}
