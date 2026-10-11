import type { PageNote } from './@types/PageNote';
import type { PageNotes } from './@types/PageNotes';

const ROUTE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}__feedback`;

let ids: string[] = [];
let notes: PageNote[] = [];
const listeners: (() => void)[] = [];
const changed = (): void => listeners.forEach((listener) => listener());

let loaded = false;

export const pageNotes: PageNotes = {
  ids: () => ids,
  loaded: () => loaded,
  list: () => notes,
  async refresh() {
    const res = await fetch(`${ROUTE}?path=${encodeURIComponent(location.pathname)}`);
    const body = (await res.json()) as { ids: string[]; notes?: PageNote[] };
    ids = body.ids;
    loaded = true;
    // A server that predates the path filter sends only ids: the page then knows its notes by what it posts.
    notes = (body.notes ?? []).filter((n) => n.note.page.path === location.pathname);
    changed();
  },
  add(id, note) {
    if (!ids.includes(id)) ids = [...ids, id];
    notes = [...notes.filter((n) => n.id !== id), { id, note }];
    changed();
  },
  async remove(id) {
    const res = await fetch(`${ROUTE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`the server said ${res.status}`);
    ids = ids.filter((i) => i !== id);
    notes = notes.filter((n) => n.id !== id);
    changed();
  },
  subscribe: (listener) => void listeners.push(listener),
};
