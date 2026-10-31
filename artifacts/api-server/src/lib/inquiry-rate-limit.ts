const WINDOW_MS = 15 * 60 * 1000;
const MAX_INQUIRIES_PER_WINDOW = 5;
const MAX_TRACKED_ADDRESSES = 5_000;

const submissionsByAddress = new Map<string, number[]>();

export function checkInquiryRateLimit(
  address: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const submissions = (submissionsByAddress.get(address) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );

  if (submissions.length >= MAX_INQUIRIES_PER_WINDOW) {
    submissionsByAddress.set(address, submissions);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((submissions[0] + WINDOW_MS - now) / 1000)),
    };
  }

  submissions.push(now);
  submissionsByAddress.delete(address);
  submissionsByAddress.set(address, submissions);

  if (submissionsByAddress.size > MAX_TRACKED_ADDRESSES) {
    const oldestAddress = submissionsByAddress.keys().next().value;
    if (oldestAddress) submissionsByAddress.delete(oldestAddress);
  }

  return { allowed: true };
}
