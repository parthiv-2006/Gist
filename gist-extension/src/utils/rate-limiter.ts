// src/utils/rate-limiter.ts
// Sliding-window rate limiter. Tracks call timestamps and rejects calls
// that exceed maxCount within the last windowMs milliseconds.
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxCount: number,
    private readonly windowMs: number
  ) {}

  isAllowed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxCount) return false;
    this.timestamps.push(now);
    return true;
  }
}
