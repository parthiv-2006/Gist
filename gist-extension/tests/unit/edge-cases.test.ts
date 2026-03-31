// tests/unit/edge-cases.test.ts
import { describe, it, expect } from "vitest";
import { validateText } from "../../src/utils/text";

describe("Edge Case: Text validation", () => {
  it("handles text that is exactly 2000 characters (boundary — VALID)", () => {
    expect(validateText("a".repeat(2000))).toBe("VALID");
  });

  it("handles text that is exactly 2001 characters (boundary — TOO_LONG)", () => {
    expect(validateText("a".repeat(2001))).toBe("TEXT_TOO_LONG");
  });

  it("handles text with only special characters", () => {
    // Special chars alone are still valid text
    expect(validateText("!@#$%^&*()")).toBe("VALID");
  });

  it("handles unicode and emoji text", () => {
    expect(validateText("こんにちは 🌍 مرحبا")).toBe("VALID");
  });
});
