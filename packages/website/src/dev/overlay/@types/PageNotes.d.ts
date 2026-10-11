import type { FeedbackNote } from '../../../../../../tools/site/@types/FeedbackNote';
import type { PageNote } from './PageNote';

/** The feedback notes that exist for this page, shared by the feedback tool and the review's section panels. */
export type PageNotes = {
  /** Every note file's id, this page's or not; a pin whose note is gone from this list is dropped. */
  ids: () => string[];
  /** False until the server has answered once: the ids are not the full list before that. */
  loaded: () => boolean;
  list: () => PageNote[];
  /** Asks the server again; rejects when it cannot be reached. */
  refresh: () => Promise<void>;
  add: (id: string, note: FeedbackNote) => void;
  /** Deletes the note file, then forgets it; rejects when the server refuses. */
  remove: (id: string) => Promise<void>;
  subscribe: (listener: () => void) => void;
};
