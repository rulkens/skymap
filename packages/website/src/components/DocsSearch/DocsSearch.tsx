/*
 * DocsSearch — the control that opens search, and the sheet it opens: a field
 * set in the display face, as the title of a page of results, over the pages
 * that match. The index is Pagefind's, cut from the built pages by the site's
 * build (astro.config.mjs) and fetched when the sheet first opens, never with
 * the page. The development server has no index, and the sheet says so. A
 * result opens its page, or the term, row or heading on it that names what was
 * asked for (utils/searchLanding.ts). Arrow keys walk from the field through
 * the results and back; Enter opens the first. `/` opens it from anywhere.
 * `big` is the control at a page's own size, for the docs index.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PagefindApi } from '../../@types/PagefindApi';
import type { PagefindPage } from '../../@types/PagefindPage';
import { cx } from '../../utils/cx.ts';
import { searchLanding } from '../../utils/searchLanding.ts';
import { sitePath } from '../../utils/sitePath.ts';
import Icon from '../Icon/Icon.tsx';
import styles from './DocsSearch.module.css';

type DocsSearchProps = { big?: boolean; className?: string };

const SHOWN = 8;
const NO_INDEX = import.meta.env.DEV
  ? 'Search reads an index that is cut when the site is built. This is the development server, which has none.'
  : 'The search index did not load. Reload the page to try again.';
const INDEX_URL = sitePath('/pagefind/pagefind.js');

// The import is the browser's own, of an address only the build knows: Vite would rewrite one it bundled.
const loadIndex = (): Promise<PagefindApi> => import(/* @vite-ignore */ INDEX_URL);

function DocsSearch({ big = false, className }: DocsSearchProps) {
  const sheet = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const api = useRef<Promise<PagefindApi | null>>(undefined);
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<{ query: string; pages: PagefindPage[] }>({
    query: '',
    pages: [],
  });

  const open = useCallback(() => {
    const dialog = sheet.current!;
    if (dialog.open) return;
    dialog.showModal();
    field.current!.select();
    api.current ??= loadIndex().catch(() => null);
    void api.current.then((module) => {
      if (!module) setStatus(NO_INDEX);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]'))
        return;
      // Another sheet (a picture, enlarged) has the page: the key is not for this one.
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      open();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const search = async () => {
    const query = field.current!.value.trim();
    const module = await api.current;
    if (!module) return;
    if (query === '') {
      setFound({ query: '', pages: [] });
      setStatus('');
      return;
    }
    const result = await module.debouncedSearch(query);
    if (!result || query !== field.current!.value.trim()) return;
    const pages = await Promise.all(result.results.slice(0, SHOWN).map((hit) => hit.data()));
    if (query !== field.current!.value.trim()) return;
    setFound({ query, pages });
    const total = result.results.length;
    setStatus(
      total === 0
        ? `Nothing matches “${query}”.`
        : total > SHOWN
          ? `The first ${SHOWN} of ${total} pages that match “${query}”.`
          : `${total} ${total === 1 ? 'page matches' : 'pages match'} “${query}”.`,
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const stops = [field.current!, ...list.current!.querySelectorAll<HTMLElement>('a')];
    if (event.key === 'Enter' && event.target === field.current) {
      // Until the search for what is typed has come back, the list is still the last query's.
      if (found.query === field.current!.value.trim()) stops[1]?.click();
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const at = stops.indexOf(document.activeElement as HTMLElement);
    if (step === 0 || at === -1 || !stops[at + step]) return;
    event.preventDefault();
    stops[at + step]!.focus();
  };

  return (
    <>
      <button
        className={cx(styles.open, !big && styles.small, className)}
        type="button"
        aria-haspopup="dialog"
        onClick={open}
      >
        <Icon name="search" />
        Search the docs <kbd aria-hidden="true">/</kbd>
      </button>

      <dialog
        ref={sheet}
        className={styles.sheet}
        aria-labelledby="search-label"
        // A click on the dimmed page behind the sheet lands on the dialog element itself.
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current!.close();
        }}
        onKeyDown={onKeyDown}
      >
        <div className={styles.inside}>
          <div className={styles.ask}>
            <label className={styles.label} id="search-label" htmlFor="search-field">
              Search the docs
            </label>
            <input
              ref={field}
              id="search-field"
              type="text"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              onInput={() => void search()}
            />
          </div>
          <button className={styles.shut} type="button" onClick={() => sheet.current!.close()}>
            <Icon name="close" />
            Close
          </button>
          <p className={styles.status} role="status">
            {status}
          </p>
          <ol
            ref={list}
            className={styles.results}
            // A result on the page that is open only moves the page, so the sheet has to get out of the way itself.
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) sheet.current!.close();
            }}
          >
            {found.pages.map((page) => (
              <li key={page.url}>
                <a href={searchLanding(page, found.query)}>
                  <span className={styles.title}>{page.meta.title ?? page.url}</span>
                  <span className={styles.where}>{`Docs, ${page.meta.group}`}</span>
                  {/* Pagefind's own markup: escaped page text with `<mark>` about the matched words. */}
                  <span
                    className={styles.excerpt}
                    dangerouslySetInnerHTML={{ __html: page.excerpt }}
                  />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </>
  );
}

export default DocsSearch;
