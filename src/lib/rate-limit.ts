/** Fixed-window limiter for the public submission route.
 *  In-memory, so it protects a single instance. For multiple instances put
 *  the counter in Postgres or Upstash Redis; the interface stays the same. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}
