import type { PageNote } from './PageNote';

/** What the server has told the page about its feedback notes so far. */
export type PageNotesState = {
  /** Every note file's id, this page's or not; a pin whose note is gone from this list is dropped. */
  ids: string[];
  notes: PageNote[];
  /** False until the server has answered once: the ids are not the full list before that. */
  loaded: boolean;
};
