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
  return typeof msg["type"] === "string" && "payload" in msg;
}
