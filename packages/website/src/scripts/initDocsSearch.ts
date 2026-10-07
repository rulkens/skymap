/*
 * initDocsSearch — the search sheet (components/DocsSearch.astro). Pagefind's
 * module and index are fetched the first time the sheet opens, never with the
 * page. The development server has no index (it is cut from a build), and the
 * sheet says so. A result opens its page, or the term, row or heading on it
 * that names what was asked for (utils/searchLanding.ts). Arrow keys walk from the field through the results and back;
 * Enter in the field opens the first result.
 */
import type { PagefindApi } from '../@types/PagefindApi';
import type { PagefindPage } from '../@types/PagefindPage';
import type { SearchSheet } from '../@types/SearchSheet';
import { searchLanding } from '../utils/searchLanding';

const SHOWN = 8;
const NO_INDEX = import.meta.env.DEV
  ? 'Search reads an index that is cut when the site is built. This is the development server, which has none.'
  : 'The search index did not load. Reload the page to try again.';

function hit(page: PagefindPage, query: string): HTMLLIElement {
  const item = document.createElement('li');
  const link = item.appendChild(document.createElement('a'));
  link.href = searchLanding(page, query);
  const title = link.appendChild(document.createElement('span'));
  title.className = 'title';
  title.textContent = page.meta.title ?? page.url;
  const where = link.appendChild(document.createElement('span'));
  where.className = 'where';
  where.textContent = `Docs, ${page.meta.group}`;
  const excerpt = link.appendChild(document.createElement('span'));
  excerpt.className = 'excerpt';
  // Pagefind's own markup: escaped page text with `<mark>` about the matched words.
  excerpt.innerHTML = page.excerpt;
  return item;
}

export function initDocsSearch(sheet: SearchSheet, opener: HTMLElement): void {
  const field = sheet.querySelector<HTMLInputElement>('input')!;
  const status = sheet.querySelector<HTMLElement>('[role="status"]')!;
  const list = sheet.querySelector<HTMLOListElement>('ol')!;
  let api: Promise<PagefindApi | null> | undefined;

  const open = () => {
    if (sheet.open) return;
    sheet.showModal();
    field.select();
    api ??= sheet.loadIndex().catch(() => null);
    void api.then((module) => {
      if (!module) status.textContent = NO_INDEX;
    });
  };

  const search = async () => {
    const query = field.value.trim();
    const module = await api;
    if (!module) return;
    if (query === '') {
      list.replaceChildren();
      status.textContent = '';
      return;
    }
    const found = await module.debouncedSearch(query);
    if (!found || query !== field.value.trim()) return;
    const pages = await Promise.all(found.results.slice(0, SHOWN).map((result) => result.data()));
    if (query !== field.value.trim()) return;
    list.replaceChildren(...pages.map((page) => hit(page, query)));
    list.dataset.query = query;
    const total = found.results.length;
    status.textContent =
      total === 0
        ? `Nothing matches “${query}”.`
        : total > SHOWN
          ? `The first ${SHOWN} of ${total} pages that match “${query}”.`
          : `${total} ${total === 1 ? 'page matches' : 'pages match'} “${query}”.`;
  };

  opener.addEventListener('click', open);
  field.addEventListener('input', () => void search());
  sheet.querySelector('[data-search-close]')!.addEventListener('click', () => sheet.close());
  // A result on the page that is open only moves the page, so the sheet has to get out of the way itself.
  list.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) sheet.close();
  });
  // A click on the dimmed page behind the sheet lands on the dialog element itself.
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });

  sheet.addEventListener('keydown', (event) => {
    const stops = [field, ...list.querySelectorAll<HTMLElement>('a')];
    if (event.key === 'Enter' && event.target === field) {
      // Until the search for what is typed has come back, the list is still the last query's.
      if (list.dataset.query === field.value.trim()) stops[1]?.click();
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const at = stops.indexOf(document.activeElement as HTMLElement);
    if (step === 0 || at === -1 || !stops[at + step]) return;
    event.preventDefault();
    stops[at + step]!.focus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    // Another sheet (a picture, enlarged) has the page: the key is not for this one.
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  });
}
