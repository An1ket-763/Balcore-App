/**
 * Shared pieces of the access gate: code-shape validation and the rate limiter.
 *
 * Split out of the routes so both can be unit-tested without a server, which is
 * the same reason `lib/balcore/writes/checks.ts` holds the pure pre-checks for
 * the deposit flow.
 */

/** Exactly six ASCII digits. Nothing else is a code. */
const CODE_PATTERN = /^\d{6}$/;

/**
 * Is this the shape of a code?
 *
 * Deliberately strict: `\d` in JavaScript matches ASCII 0-9 only, so Eastern
 * Arabic numerals and full-width digits are rejected rather than silently
 * normalised into something that would never match a hash anyway. Length is
 * enforced by the anchors, so "1234567" and "12345" both fail.
 */
export function isValidCodeFormat(code: unknown): code is string {
  return typeof code === "string" && CODE_PATTERN.test(code);
}

/* ------------------------------------------------------------------ */
/* Rate limit                                                          */
/* ------------------------------------------------------------------ */

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface Bucket {
  count: number;
  /** When the current window opened, ms since epoch. */
  windowStart: number;
}

/**
 * IN-MEMORY, AND THEREFORE A SOFT LIMIT ONLY.
 *
 * This Map lives in one server process. On Netlify every function instance has
 * its own copy, instances are created and destroyed freely, and a cold start
 * begins with an empty Map — so an attacker who can spread attempts across
 * instances, or who simply retries after a scale event, gets a fresh allowance.
 * It raises the cost of a naive loop against a single instance and does nothing
 * more than that.
 *
 * A real limit needs storage shared across instances (Redis, Upstash, a MySQL
 * counter row) keyed the same way. Treat this as a speed bump until then, and
 * do not quote its numbers as a security guarantee.
 */
const buckets = new Map<string, Bucket>();

/** How many entries to hold before evicting expired ones. */
const MAX_TRACKED_IPS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window, floored at 0. */
  remaining: number;
  /** Seconds until the window resets — for the Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Count one attempt against `key` (the client IP).
 *
 * Counts the attempt whether or not it is allowed, so hammering a blocked key
 * does not let the window slide forward early.
 */
export function rateLimit(key: string, now: number = Date.now()): RateLimitResult {
  // Opportunistic sweep: without it a long-lived instance grows one entry per
  // distinct IP forever. Only runs when the Map is already large.
  if (buckets.size > MAX_TRACKED_IPS) {
    for (const [k, b] of buckets) {
      if (now - b.windowStart >= RATE_LIMIT_WINDOW_MS) buckets.delete(k);
    }
  }

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_ATTEMPTS - 1,
      retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  existing.count += 1;
  const elapsed = now - existing.windowStart;
  const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000));
  return {
    allowed: existing.count <= RATE_LIMIT_MAX_ATTEMPTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - existing.count),
    retryAfterSeconds,
  };
}

/** Test-only: drop all buckets so cases cannot leak into one another. */
export function resetRateLimit(): void {
  buckets.clear();
}
