// Tiny in-memory sliding-window rate limiter.
//
// NOTE: on serverless (Vercel) module state is per-instance, so under scale-out
// these limits are approximate, not global. That's fine for what we need here —
// a brute-force speed bump on /login and an LLM-cost cap on /api/chat. If you
// ever need hard global limits, back this with Upstash/Redis (same interface).

type Timestamps = number[];
const buckets = new Map<string, Timestamps>();

export interface RateResult {
  ok: boolean;
  /** Milliseconds until the next request would be allowed (0 when ok). */
  retryAfterMs: number;
}

/**
 * Allow at most `max` hits per `windowMs` for `key`. Records the hit when allowed.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    buckets.set(key, hits);
    const retryAfterMs = Math.max(0, hits[0] + windowMs - now);
    return { ok: false, retryAfterMs };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map doesn't grow unbounded across many keys.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length) buckets.set(k, fresh);
      else buckets.delete(k);
    }
  }

  return { ok: true, retryAfterMs: 0 };
}
