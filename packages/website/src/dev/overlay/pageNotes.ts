import type { PageNote } from './@types/PageNote';
import type { PageNotes } from './@types/PageNotes';
import type { PageNotesState } from './@types/PageNotesState';
import { FEEDBACK_ROUTE } from './feedbackRoute';

let state: PageNotesState = { ids: [], notes: [], loaded: false };
const listeners = new Set<() => void>();
const set = (next: PageNotesState): void => {
  state = next;
  for (const listener of listeners) listener();
};

export const pageNotes: PageNotes = {
  get: () => state,
  async refresh() {
    const res = await fetch(`${FEEDBACK_ROUTE}?path=${encodeURIComponent(location.pathname)}`);
    const body = (await res.json()) as { ids: string[]; notes?: PageNote[] };
    // A server that predates the path filter sends only ids: the page then knows its notes by what it posts.
    const notes = (body.notes ?? []).filter((n) => n.note.page.path === location.pathname);
    set({ ids: body.ids, notes, loaded: true });
  },
  add(id, note) {
    set({
      ids: state.ids.includes(id) ? state.ids : [...state.ids, id],
      notes: [...state.notes.filter((n) => n.id !== id), { id, note }],
      loaded: state.loaded,
    });
  },
  async remove(id) {
    const res = await fetch(`${FEEDBACK_ROUTE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`the server said ${res.status}`);
    set({
      ids: state.ids.filter((i) => i !== id),
      notes: state.notes.filter((n) => n.id !== id),
      loaded: state.loaded,
    });
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};
