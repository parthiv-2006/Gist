// tests/unit/text.test.ts
import { describe, it, expect } from "vitest";
import {
  extractSelectedText,
  validateText,
  truncateText,
  sanitizeText,
} from "../../src/utils/text";

// ─── extractSelectedText ─────────────────────────────────────────────────────

describe("extractSelectedText", () => {
  it("returns trimmed text from a real text selection", () => {
    const mockSelection = { toString: () => "  Hello World  " } as Selection;
    expect(extractSelectedText(mockSelection)).toBe("Hello World");
  });

  it("returns null when selection is empty", () => {
    const mockSelection = { toString: () => "" } as Selection;
    expect(extractSelectedText(mockSelection)).toBeNull();
  });

  it("returns null when selection is only whitespace", () => {
    const mockSelection = { toString: () => "   " } as Selection;
    expect(extractSelectedText(mockSelection)).toBeNull();
  });

  it("returns null when selection is null", () => {
    expect(extractSelectedText(null)).toBeNull();
  });
});

// ─── validateText ─────────────────────────────────────────────────────────────

describe("validateText", () => {
  it("returns VALID for a normal string under the limit", () => {
    expect(validateText("Hello world")).toBe("VALID");
  });

  it("returns TEXT_TOO_LONG for strings with 2001+ characters", () => {
    expect(validateText("a".repeat(2001))).toBe("TEXT_TOO_LONG");
  });

  it("returns VALID for a string of exactly 2000 characters (boundary)", () => {
    expect(validateText("a".repeat(2000))).toBe("VALID");
  });

  it("returns EMPTY_TEXT for an empty string", () => {
    expect(validateText("")).toBe("EMPTY_TEXT");
  });

  it("returns EMPTY_TEXT for a whitespace-only string", () => {
    expect(validateText("   ")).toBe("EMPTY_TEXT");
  });

  it("returns VALID for unicode and emoji text", () => {
    expect(validateText("こんにちは 🌍 مرحبا")).toBe("VALID");
  });

  it("returns VALID for text with only special characters", () => {
    expect(validateText("!@#$%^&*()")).toBe("VALID");
  });
});

// ─── truncateText ─────────────────────────────────────────────────────────────

describe("truncateText", () => {
  it("returns the string unchanged if under the character limit", () => {
    expect(truncateText("short text", 2000)).toBe("short text");
  });

  it("truncates and appends '...' when over the limit", () => {
    const long = "a".repeat(2005);
    const result = truncateText(long, 2000);
    expect(result.length).toBeLessThanOrEqual(2003);
    expect(result.endsWith("...")).toBe(true);
  });

  it("does NOT truncate a string of exactly 2000 characters", () => {
    const result = truncateText("a".repeat(2000), 2000);
    expect(result.length).toBe(2000);
    expect(result.endsWith("...")).toBe(false);
  });
});

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe("sanitizeText", () => {
  it("strips leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("collapses multiple internal spaces into one", () => {
    expect(sanitizeText("hello   world")).toBe("hello world");
  });

  it("replaces newline characters with a single space", () => {
    expect(sanitizeText("hello\nworld")).toBe("hello world");
  });

  it("replaces tab characters with a single space", () => {
    expect(sanitizeText("hello\tworld")).toBe("hello world");
  });

  it("handles a mix of whitespace characters", () => {
    expect(sanitizeText("  hello   \n  world  \t ")).toBe("hello world");
  });
});
