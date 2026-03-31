// tests/unit/messages.test.ts
import { describe, it, expect } from "vitest";
import { buildGistRequest, isGistMessage } from "../../src/utils/messages";

describe("buildGistRequest", () => {
  it("creates a correctly shaped GIST_REQUEST message", () => {
    const msg = buildGistRequest("jargon text", "MDN Web Docs");
    expect(msg.type).toBe("GIST_REQUEST");
    expect(msg.payload.selectedText).toBe("jargon text");
    expect(msg.payload.pageContext).toBe("MDN Web Docs");
  });

  it("does not include extra fields beyond type and payload", () => {
    const msg = buildGistRequest("text", "context");
    expect(Object.keys(msg)).toEqual(["type", "payload"]);
  });
});

describe("isGistMessage", () => {
  it("returns true for a valid GistMessage", () => {
    expect(isGistMessage({ type: "GIST_REQUEST", payload: {} })).toBe(true);
  });

  it("returns false when type field is missing", () => {
    expect(isGistMessage({ payload: {} })).toBe(false);
  });

  it("returns false when payload field is missing", () => {
    expect(isGistMessage({ type: "GIST_REQUEST" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGistMessage(null)).toBe(false);
  });

  it("returns false for a primitive value", () => {
    expect(isGistMessage("not an object")).toBe(false);
  });
});
