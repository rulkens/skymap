import type { FeedbackNote } from '../../../../../../tools/site/@types/FeedbackNote';
import type { PageNotesState } from './PageNotesState';

/** The feedback notes that exist for this page, shared by the feedback tool and the review's section panels. */
export type PageNotes = {
  /** A new object after every change, so `useSyncExternalStore` can compare it. */
  get: () => PageNotesState;
  /** Asks the server again; rejects when it cannot be reached. */
  refresh: () => Promise<void>;
  add: (id: string, note: FeedbackNote) => void;
  /** Deletes the note file, then forgets it; rejects when the server refuses. */
  remove: (id: string) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};
