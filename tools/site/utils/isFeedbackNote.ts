import type { FeedbackNote } from '../@types/FeedbackNote';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Whether a posted body is a note the endpoint may store. */
export function isFeedbackNote(value: unknown): value is FeedbackNote {
  const note = value as FeedbackNote | null;
  return (
    typeof note?.text === 'string' &&
    note.text.trim() !== '' &&
    typeof note.timestamp === 'string' &&
    // The timestamp becomes part of a file name: only an ISO instant, never a path.
    ISO_INSTANT.test(note.timestamp) &&
    typeof note.page?.path === 'string' &&
    typeof note.element?.selector === 'string'
  );
}
