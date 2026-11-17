/** The sentences of a text: a full stop, question or exclamation mark followed by a space and a capital ends one. */
export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z‘“])/);
}
