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
