import { pageRect } from '../feedback/pageRect';
import type { ChipAnchor } from './@types/ChipAnchor';
import { wordsIn } from './wordsIn';

/** The selection inside `article`: its word count and where its first and last lines are; null when there is none. */
export function readSelection(article: Element): { words: number; anchor: ChipAnchor } | null {
  const selection = getSelection();
  if (!selection || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!article.contains(range.commonAncestorContainer)) return null;
  const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const words = wordsIn(selection.toString());
  if (!words || lines.length === 0) return null;
  return { words, anchor: { first: pageRect(lines[0]!), last: pageRect(lines.at(-1)!) } };
}
