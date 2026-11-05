import { useSyncExternalStore } from 'react';

import type { PageNotesState } from './@types/PageNotesState';
import { pageNotes } from './pageNotes';

export function usePageNotes(): PageNotesState {
  return useSyncExternalStore(pageNotes.subscribe, pageNotes.get);
}
