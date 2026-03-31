const MAX_TEXT_LENGTH = 2000;

/**
 * Extracts and trims selected text from a Selection object.
 * Accept the selection as a parameter (rather than reading window.getSelection()
 * internally) so this function can be unit tested with mock Selection objects.
 *
 * Call site: extractSelectedText(window.getSelection())
 */
export function extractSelectedText(selection: Pick<Selection, "toString"> | null): string | null {
  if (!selection) return null;
  const text = selection.toString().trim();
  return text.length > 0 ? text : null;
}

export type ValidationResult = "VALID" | "EMPTY_TEXT" | "TEXT_TOO_LONG";

export function validateText(text: string): ValidationResult {
  if (text.trim().length === 0) return "EMPTY_TEXT";
  if (text.length > MAX_TEXT_LENGTH) return "TEXT_TOO_LONG";
  return "VALID";
}

export function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}

export function sanitizeText(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
