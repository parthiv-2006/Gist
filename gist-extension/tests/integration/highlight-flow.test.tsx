// tests/integration/highlight-flow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Popover } from "../../src/content/components/Popover";

// Mock chrome APIs globally
const mockSendMessage = vi.fn();
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  },
});

describe("Popover Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading skeleton when state is LOADING", () => {
    render(<Popover state="LOADING" text="" onClose={() => {}} />);
    expect(screen.getByTestId("gist-skeleton")).toBeInTheDocument();
  });

  it("renders streamed text when state is STREAMING", () => {
    render(<Popover state="STREAMING" text="JS does one thing" onClose={() => {}} />);
    expect(screen.getByText(/JS does one thing/)).toBeInTheDocument();
  });

  it("renders full explanation when state is DONE", () => {
    render(<Popover state="DONE" text="Full explanation here." onClose={() => {}} />);
    expect(screen.getByText("Full explanation here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("renders an error message when state is ERROR", () => {
    render(<Popover state="ERROR" text="" error="Network unavailable." onClose={() => {}} />);
    expect(screen.getByText(/Network unavailable/i)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const mockClose = vi.fn();
    render(<Popover state="DONE" text="Some text." onClose={mockClose} />);
    screen.getByRole("button", { name: /close/i }).click();
    await waitFor(() => expect(mockClose).toHaveBeenCalledOnce());
  });

  it("returns null when state is IDLE", () => {
    const { container } = render(<Popover state="IDLE" text="" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the GIST brand label in the header", () => {
    render(<Popover state="DONE" text="Some text." onClose={() => {}} />);
    expect(screen.getByText("GIST")).toBeInTheDocument();
  });

  it("shows fallback error message when no error prop is provided", () => {
    render(<Popover state="ERROR" text="" onClose={() => {}} />);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("renders with correct ARIA role and label", () => {
    render(<Popover state="DONE" text="Explanation." onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: /gist explanation/i })).toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const mockClose = vi.fn();
    render(<Popover state="DONE" text="Some text." onClose={mockClose} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() => expect(mockClose).toHaveBeenCalledOnce());
  });
});

describe("Popover mode selector", () => {
  it("renders all four mode buttons when onModeChange is provided", () => {
    render(
      <Popover state="DONE" text="text" onClose={() => {}} onModeChange={() => {}} mode="standard" />
    );
    expect(screen.getByRole("button", { name: /standard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /eli5/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /legal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /academic/i })).toBeInTheDocument();
  });

  it("marks the active mode button as selected", () => {
    render(
      <Popover state="DONE" text="text" onClose={() => {}} onModeChange={() => {}} mode="legal" />
    );
    expect(screen.getByRole("button", { name: /legal/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /standard/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onModeChange with the new mode when a mode button is clicked", async () => {
    const mockModeChange = vi.fn();
    render(
      <Popover state="DONE" text="text" onClose={() => {}} onModeChange={mockModeChange} mode="standard" />
    );
    screen.getByRole("button", { name: /eli5/i }).click();
    await waitFor(() => expect(mockModeChange).toHaveBeenCalledWith("simple"));
  });

  it("disables mode buttons while LOADING", () => {
    render(
      <Popover state="LOADING" text="" onClose={() => {}} onModeChange={() => {}} mode="standard" />
    );
    expect(screen.getByRole("button", { name: /standard/i })).toBeDisabled();
  });

  it("does not render mode selector when onModeChange is not provided", () => {
    render(<Popover state="DONE" text="text" onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /eli5/i })).not.toBeInTheDocument();
  });
});
