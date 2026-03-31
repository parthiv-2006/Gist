// tests/unit/rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first call", () => {
    const limiter = new RateLimiter(5, 10_000);
    expect(limiter.isAllowed()).toBe(true);
  });

  it("allows up to maxCount calls within the window", () => {
    const limiter = new RateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed()).toBe(true);
    }
  });

  it("blocks the (maxCount + 1)th call within the window", () => {
    const limiter = new RateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) limiter.isAllowed();
    expect(limiter.isAllowed()).toBe(false);
  });

  it("allows calls again after the full window has expired", () => {
    const limiter = new RateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) limiter.isAllowed();
    expect(limiter.isAllowed()).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect(limiter.isAllowed()).toBe(true);
  });

  it("slides the window correctly — only evicts timestamps older than windowMs", () => {
    const limiter = new RateLimiter(5, 10_000);
    // Fill 5 slots at t=0
    for (let i = 0; i < 5; i++) limiter.isAllowed();
    // Advance to t=5001 — all 5 are still within the 10s window
    vi.advanceTimersByTime(5_001);
    expect(limiter.isAllowed()).toBe(false);
    // Advance to t=10_002 — all 5 original calls have expired
    vi.advanceTimersByTime(5_001);
    expect(limiter.isAllowed()).toBe(true);
  });

  it("resets cleanly — allows maxCount calls again after expiry", () => {
    const limiter = new RateLimiter(3, 5_000);
    for (let i = 0; i < 3; i++) limiter.isAllowed();
    expect(limiter.isAllowed()).toBe(false);
    vi.advanceTimersByTime(5_001);
    for (let i = 0; i < 3; i++) {
      expect(limiter.isAllowed()).toBe(true);
    }
    expect(limiter.isAllowed()).toBe(false);
  });
});
