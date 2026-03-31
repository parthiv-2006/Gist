export type MessageType =
  | "GIST_REQUEST"
  | "GIST_FOLLOW_UP"
  | "GIST_CONTEXT_MENU_TRIGGERED"
  | "GIST_SHORTCUT_TRIGGERED"
  | "GIST_CHUNK"
  | "GIST_COMPLETE"
  | "GIST_ERROR";

export type ComplexityLevel = "standard" | "simple" | "legal" | "academic";

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface GistMessage {
  type: MessageType;
  payload: {
    selectedText?: string;
    pageContext?: string;
    complexityLevel?: ComplexityLevel;
    messages?: ChatMessage[];
    query?: string;
    chunk?: string;
    error?: string;
  };
}

export function buildGistRequest(
  selectedText: string,
  pageContext: string,
  complexityLevel: ComplexityLevel = "standard"
): GistMessage {
  return {
    type: "GIST_REQUEST",
    payload: { selectedText, pageContext, complexityLevel },
  };
}

export function isGistMessage(value: unknown): value is GistMessage {
  if (value === null || typeof value !== "object") return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg["type"] !== "string" || !("payload" in msg)) return false;
  // Validate that `type` is one of the known MessageType values.
  // This prevents forged or accidental messages from other extensions or host
  // pages from being processed as Gist messages.
  const VALID_TYPES: readonly string[] = [
    "GIST_REQUEST",
    "GIST_FOLLOW_UP",
    "GIST_CONTEXT_MENU_TRIGGERED",
    "GIST_SHORTCUT_TRIGGERED",
    "GIST_CHUNK",
    "GIST_COMPLETE",
    "GIST_ERROR",
  ];
  return VALID_TYPES.includes(msg["type"] as string);
}
