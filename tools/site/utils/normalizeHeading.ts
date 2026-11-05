/**
 * A heading's text as the structure file and the page are compared: whitespace runs (including the
 * line breaks and non-breaking spaces markup leaves behind) become one space, ends trimmed.
 * Shared by the drift check and the review tool, so both match a section the same way.
 */
export function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
