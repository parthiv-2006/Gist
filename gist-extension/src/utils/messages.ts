export type MessageType =
  | "GIST_REQUEST"
  | "GIST_FOLLOW_UP"
  | "GIST_CONTEXT_MENU_TRIGGERED"
  | "GIST_SHORTCUT_TRIGGERED"
  | "GIST_CAPTURE_START"
  | "CAPTURE_VISIBLE_TAB"
  | "GIST_SIDEBAR_TOGGLE"
  | "GIST_CHUNK"
  | "GIST_COMPLETE"
  | "GIST_ERROR"
  | "OPEN_LIBRARY"
  | "SAVE_GIST"
  | "SAVE_GIST_RESULT"
  | "AUTOGIST_REQUEST"
  | "AUTOGIST_RESPONSE"
  | "AUTOGIST_ERROR"
  | "LENS_SCAN_REQUEST"
  | "LENS_SCAN_RESPONSE"
  | "LENS_SCAN_ERROR";

export type ComplexityLevel = "standard" | "simple" | "legal" | "academic";

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface LensTerm {
  term: string;
  definition: string;
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
    imageData?: string;
    imageMimeType?: string;
    // AutoGist fields
    textChunk?: string;
    url?: string;
    takeaways?: string[];
    // Save gist fields
    explanation?: string;
    success?: boolean;
    // Gist Lens fields
    terms?: LensTerm[];
  };
}

export function buildGistRequest(
  selectedText: string,
  pageContext: string,
  complexityLevel: ComplexityLevel = "standard",
  imageData?: string,
  imageMimeType?: string
): GistMessage {
  return {
    type: "GIST_REQUEST",
    payload: { selectedText, pageContext, complexityLevel, imageData, imageMimeType },
  };
}

export function isGistMessage(value: unknown): value is GistMessage {
  if (value === null || typeof value !== "object") return false;
  const msg = value as Record<string, unknown>;
  const type = msg["type"];
  if (typeof type !== "string" || !("payload" in msg)) return false;

  const VALID_TYPES: readonly string[] = [
    "GIST_REQUEST",
    "GIST_FOLLOW_UP",
    "GIST_CONTEXT_MENU_TRIGGERED",
    "GIST_SHORTCUT_TRIGGERED",
    "GIST_CAPTURE_START",
    "CAPTURE_VISIBLE_TAB",
    "GIST_SIDEBAR_TOGGLE",
    "GIST_CHUNK",
    "GIST_COMPLETE",
    "GIST_ERROR",
    "OPEN_LIBRARY",
    "SAVE_GIST",
    "SAVE_GIST_RESULT",
    "AUTOGIST_REQUEST",
    "AUTOGIST_RESPONSE",
    "AUTOGIST_ERROR",
    "LENS_SCAN_REQUEST",
    "LENS_SCAN_RESPONSE",
    "LENS_SCAN_ERROR",
  ];
  return VALID_TYPES.includes(type);
}
