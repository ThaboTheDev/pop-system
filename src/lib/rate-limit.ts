/** Fixed-window limiter for the public submission route.
 *
 *  In-memory, so it protects a single Node instance. On Vercel you will run
 *  many lambdas; the limiter here raises the cost of abuse but is not a hard
 *  distributed guarantee. For a strict multi-instance limit, put the counter
 *  in Upstash Redis or a small Postgres table — the call site stays the same.
 */
const hits = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 5000;

export function rateLimit(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();

  // Opportunistically sweep expired entries on every call so memory cannot
  // grow without bound. Previously this only ran when hits.size > 10,000,
  // which let the map creep upward under traffic.
  if (hits.size > MAX_ENTRIES / 2) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    // If still above cap after evicting expired entries, drop oldest entries.
    if (hits.size > MAX_ENTRIES) {
      const ordered = [...hits.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      const toDrop = hits.size - MAX_ENTRIES;
      for (let i = 0; i < toDrop; i += 1) hits.delete(ordered[i][0]);
    }
  }

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}
