interface WindowBucket {
  timestamps: number[];
}

const buckets = new Map<string, WindowBucket>();

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit(policy: RateLimitPolicy, now = Date.now()): boolean {
  const bucket = buckets.get(policy.key) ?? { timestamps: [] };
  const cutoff = now - policy.windowMs;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= policy.limit) {
    buckets.set(policy.key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  buckets.set(policy.key, bucket);

  // Prevent unbounded growth on long-running Node servers
  if (buckets.size > 10000) {
    for (const [k, b] of buckets.entries()) {
      if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] < now - 3600_000) {
        buckets.delete(k);
      }
    }
  }
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
