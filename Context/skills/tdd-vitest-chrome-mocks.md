---
name: tdd-vitest-chrome-mocks
description: >
  TDD workflow for the Chrome Extension frontend using Vitest.
  Covers how to mock the Chrome Extension API (chrome.runtime, chrome.tabs,
  chrome.storage, chrome.contextMenus) in a Vitest + jsdom environment, how to
  write unit tests for pure utility functions, and how to write component-level
  integration tests for the React Popover using @testing-library/react.
  Red-Green-Refactor discipline is enforced: tests are written before implementation.
  Use this skill for all Phase 1, 3, and 4 testing in the Gist extension.
---

## Overview

The Chrome Extension API (`chrome.*`) does not exist in a Node.js/jsdom test environment. Every test file that touches extension code must mock it. This skill provides the canonical setup to do that correctly.

**TDD Order for this project:**
1. Write test stubs (all failing — Red)
2. Run `npm test` → confirm failures
3. Write implementation code
4. Run `npm test` → confirm all passing (Green)
5. Refactor if needed, re-run tests

---

## 1. Global Mock Setup (`tests/setup.ts`)

This file runs before EVERY test automatically (configured in `vite.config.ts` via `test.setupFiles`).

```typescript
// tests/setup.ts
import "@testing-library/jest-dom";
import { vi, afterEach } from "vitest";

// Reset all mocks after each test to prevent cross-test contamination
afterEach(() => {
  vi.clearAllMocks();
});

// Full Chrome API mock — extend as needed when new APIs are used
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListeners: vi.fn(() => false),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    id: "test-extension-id",
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
});
```

---

## 2. Unit Tests: Utility Functions (`tests/unit/text.test.ts`)

Pure functions with no side effects. These are the easiest tests to write — no mocking of Chrome needed.

**Rule:** Write these tests BEFORE creating `src/utils/text.ts`.

```typescript
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
    // JSDOM supports window.getSelection() but it's limited.
    // Test the underlying string processing logic by calling the function
    // with a manually crafted Selection object substitute.
    // Implementation should call selection.toString() internally.
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

  it("truncates exactly at the limit", () => {
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
```

---

## 3. Unit Tests: Message Utilities (`tests/unit/messages.test.ts`)

```typescript
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
```

---

## 4. Integration Tests: React Popover Component (`tests/integration/highlight-flow.test.ts`)

These tests use `@testing-library/react` to render the Popover and assert on its behavior.

```typescript
// tests/integration/highlight-flow.test.ts
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Popover } from "../../src/content/components/Popover";

describe("Popover: LOADING state", () => {
  it("renders a skeleton element", () => {
    render(<Popover state="LOADING" text="" onClose={vi.fn()} />);
    expect(screen.getByTestId("gist-skeleton")).toBeInTheDocument();
  });

  it("does NOT render any explanation text", () => {
    render(<Popover state="LOADING" text="" onClose={vi.fn()} />);
    expect(screen.queryByRole("paragraph")).toBeNull();
  });
});

describe("Popover: STREAMING state", () => {
  it("renders the partial text received so far", () => {
    render(<Popover state="STREAMING" text="JS does one thing" onClose={vi.fn()} />);
    expect(screen.getByText(/JS does one thing/)).toBeInTheDocument();
  });

  it("does NOT render the skeleton", () => {
    render(<Popover state="STREAMING" text="Some text" onClose={vi.fn()} />);
    expect(screen.queryByTestId("gist-skeleton")).toBeNull();
  });
});

describe("Popover: DONE state", () => {
  it("renders the full explanation text", () => {
    render(
      <Popover state="DONE" text="Full explanation here." onClose={vi.fn()} />
    );
    expect(screen.getByText("Full explanation here.")).toBeInTheDocument();
  });

  it("renders the close button", () => {
    render(<Popover state="DONE" text="Text" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<Popover state="DONE" text="Text" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    render(<Popover state="DONE" text="Text" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});

describe("Popover: ERROR state", () => {
  it("renders the error message", () => {
    render(
      <Popover
        state="ERROR"
        text=""
        error="Network unavailable."
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Network unavailable/i)).toBeInTheDocument();
  });

  it("renders a generic message when no error prop is given", () => {
    render(<Popover state="ERROR" text="" onClose={vi.fn()} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("does NOT render the skeleton in error state", () => {
    render(<Popover state="ERROR" text="" error="Fail" onClose={vi.fn()} />);
    expect(screen.queryByTestId("gist-skeleton")).toBeNull();
  });
});

describe("Popover: IDLE state", () => {
  it("renders nothing", () => {
    const { container } = render(
      <Popover state="IDLE" text="" onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

---

## 5. Edge Case Tests (`tests/unit/edge-cases.test.ts`)

Write these in Phase 4 BEFORE hardening the implementation.

```typescript
// tests/unit/edge-cases.test.ts
import { describe, it, expect } from "vitest";
import { validateText, sanitizeText } from "../../src/utils/text";

describe("Boundary Values: validateText", () => {
  it("exactly 2000 chars → VALID", () => {
    expect(validateText("a".repeat(2000))).toBe("VALID");
  });

  it("exactly 2001 chars → TEXT_TOO_LONG", () => {
    expect(validateText("a".repeat(2001))).toBe("TEXT_TOO_LONG");
  });

  it("a single character → VALID", () => {
    expect(validateText("a")).toBe("VALID");
  });
});

describe("Unusual Inputs: sanitizeText", () => {
  it("handles a string with only newlines", () => {
    // Should reduce to empty or normalized form
    const result = sanitizeText("\n\n\n");
    expect(result.length).toBeLessThan(5);
  });

  it("handles a string that is entirely emoji", () => {
    expect(sanitizeText("🌍🌎🌏")).toBe("🌍🌎🌏");
  });
});
```

---

## 6. Running Tests

```bash
# Run all tests once
npm run test

# Run in watch mode (re-runs on file save)
npm run test:watch

# With coverage report
npm run test:coverage
```

**Expected output for a fully implemented Phase 1:**
```
✓ tests/unit/text.test.ts (12 tests)
✓ tests/unit/messages.test.ts (5 tests)

Test Files  2 passed (2)
Tests       17 passed (17)
Duration    ~350ms
```

---

## 7. When Chrome API Mock Needs Per-Test Override

Sometimes you need a mock to return specific values in one test only:

```typescript
it("sends message when selection is valid", () => {
  // Override the global mock for this test only
  const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
  sendMessageMock.mockImplementationOnce(() => undefined);

  // ... your test code

  expect(sendMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: "GIST_REQUEST" })
  );
});
```

---

## 8. Common Pitfalls

| Pitfall | Fix |
|---|---|
| `ReferenceError: chrome is not defined` | The global stub in `tests/setup.ts` isn't running. Verify `setupFiles: "./tests/setup.ts"` is in `vite.config.ts` `test` block |
| Shadow DOM tests fail — `document.querySelector` can't find elements | Elements inside Shadow DOM are invisible to `document.querySelector`. Test the React component directly without Shadow DOM (see the Popover tests above) |
| `@testing-library/jest-dom` matchers like `toBeInTheDocument` are undefined | Add `import "@testing-library/jest-dom"` to `tests/setup.ts`, not in each test file |
| Tests pass but actual extension doesn't work | Tests mock Chrome APIs. Manual verification in `chrome://extensions` is still required after each phase |
| `vi.clearAllMocks()` isn't resetting mock return values | Use `vi.resetAllMocks()` instead — `clearAllMocks` only clears call history, not implementations |
