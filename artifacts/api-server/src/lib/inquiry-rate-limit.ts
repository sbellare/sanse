const WINDOW_MS = 15 * 60 * 1000;
const MAX_INQUIRIES_PER_WINDOW = 5;

export type InquiryRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface InquiryRateLimitStore {
  consume(
    address: string,
    windowMs: number,
    limit: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export function createInquiryRateLimiter(
  store: InquiryRateLimitStore,
  windowMs = WINDOW_MS,
  limit = MAX_INQUIRIES_PER_WINDOW,
): (address: string) => Promise<InquiryRateLimitDecision> {
  return async (address) => {
    const result = await store.consume(address, windowMs, limit);
    if (result.allowed) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  };
}

const postgresStore: InquiryRateLimitStore = {
  async consume(address, windowMs, limit) {
    const { pool } = await import("@workspace/db");

    // The expiry index keeps abandoned addresses from accumulating indefinitely.
    // Preserve the current address until its atomic upsert below can prune it.
    await pool.query(
      "DELETE FROM inquiry_rate_limits WHERE expires_at <= NOW() AND address <> $1",
      [address],
    );

    const recentSubmissions = `ARRAY(
      SELECT submitted_at
      FROM unnest(inquiry_rate_limits.submissions) AS recent(submitted_at)
      WHERE submitted_at > NOW() - ($2 * INTERVAL '1 millisecond')
      ORDER BY submitted_at
    )`;
    const result = await pool.query<{
      allowed: boolean;
      retry_after_seconds: number;
    }>(
      `INSERT INTO inquiry_rate_limits
         (address, submissions, expires_at, last_request_allowed)
       VALUES ($1, ARRAY[NOW()], NOW() + ($2 * INTERVAL '1 millisecond'), TRUE)
       ON CONFLICT (address) DO UPDATE
       SET submissions = CASE
             WHEN cardinality(${recentSubmissions}) < $3
               THEN array_append(${recentSubmissions}, NOW())
             ELSE ${recentSubmissions}
           END,
           expires_at = NOW() + ($2 * INTERVAL '1 millisecond'),
           last_request_allowed = cardinality(${recentSubmissions}) < $3
       RETURNING
         last_request_allowed AS allowed,
         GREATEST(
           1,
           CEIL(EXTRACT(EPOCH FROM (
             submissions[1] + ($2 * INTERVAL '1 millisecond') - NOW()
           )))
         )::integer AS retry_after_seconds`,
      [address, windowMs, limit],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Inquiry rate limit counter was not returned");
    return {
      allowed: row.allowed,
      retryAfterSeconds: row.retry_after_seconds,
    };
  },
};

export const checkInquiryRateLimit = createInquiryRateLimiter(postgresStore);
