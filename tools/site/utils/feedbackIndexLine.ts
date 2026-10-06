import type { FeedbackNote } from '../@types/FeedbackNote';

const SUMMARY_MAX = 120;

/**
 * One `index.md` line per note: when, which page, which element, where its
 * source is, what was said, and the file holding the rest. The agent reads
 * this one file first and opens a JSON only for the notes it acts on.
 */
export function feedbackIndexLine(note: FeedbackNote, stem: string): string {
  const { source } = note.element;
  const where = source
    ? `${source.file}:${source.loc}${source.inherited ? ' (ancestor)' : ''}`
    : 'no source';
  const first = note.text.trim().split('\n')[0]!;
  const summary = first.length > SUMMARY_MAX ? `${first.slice(0, SUMMARY_MAX - 1)}…` : first;
  const time = note.timestamp.slice(0, 19).replace('T', ' ');
  return `- ${time}Z · ${note.page.path} · \`${note.element.selector}\` · ${where} · ${summary} · ${stem}.json`;
}
