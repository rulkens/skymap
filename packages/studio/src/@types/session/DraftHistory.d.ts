/** The draft's undo and redo stacks, newest last. */
import type { HistoryEntry } from './HistoryEntry';

export type DraftHistory = {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
};
