/*
 * DocsNav — the docs' own contents, beside every docs page: the seven groups
 * of data/docsTree.ts in order, search above them. A written page is a link; a
 * planned one is its name, dimmer and inert, so the tree shows its whole shape
 * from the first page on. Pages that are one of many of a kind (a data source)
 * are listed only on a page of that kind. The page you are on carries the app's selection
 * mark, a filled point with a ring about it, hung left of the text edge.
 * Narrow, it is a bar that stays under the top bar: "Contents" and search.
 * The list opens over the page, not in it, with the page's own sections first.
 */
import type { MarkdownHeading } from 'astro';
import { Fragment, useEffect, useRef } from 'react';

import type { DocsGroup } from '../../@types/DocsGroup';
import { sitePath } from '../../utils/sitePath.ts';
import DocsSearch from '../DocsSearch/DocsSearch.tsx';
import Icon from '../Icon/Icon.tsx';
import PageSections from '../PageSections/PageSections.tsx';
import styles from './DocsNav.module.css';

// The tree comes in as a prop: data/docsTree.ts reads ATTRIBUTIONS.md from disk, so it cannot be in an island's bundle.
type DocsNavProps = {
  current: string;
  sections: readonly MarkdownHeading[];
  groups: readonly Pick<DocsGroup, 'name' | 'pages'>[];
};

// Before the first paint, so a phone never shows the list open and then folds it; without script it stays open.
// Wide, the list scrolls by itself: the row of the page you are on is brought to its middle, and nothing else moves.
// It runs where it stands in the markup, at parse time, so it is a string and not a hook: an effect would be too late.
const BEFORE_PAINT = `{
  const menu = document.currentScript.previousElementSibling;
  const nav = menu.parentElement;
  const here = menu.querySelector('[aria-current]');
  if (matchMedia('(max-width: 900px)').matches) menu.open = false;
  else if (here) nav.scrollTop = here.offsetTop - nav.clientHeight / 2;
}`;

function DocsNav({ current, sections, groups }: DocsNavProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const tree = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = menu.current!;
    const narrow = matchMedia('(max-width: 900px)');
    // The list is one element at every width: wide, it must be open, since its summary is not shown there.
    const onWidth = () => (details.open = !narrow.matches);
    // Narrow, the list is a sheet with its own scroll: opened, it shows the row of the page you are on.
    const onToggle = () => {
      const list = tree.current!;
      const here = details.querySelector<HTMLElement>('[aria-current]');
      if (details.open && narrow.matches && here)
        list.scrollTop = here.offsetTop - list.clientHeight / 2;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !narrow.matches || !details.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    // The open list lies over the page: a jump within the page, or a tap on the page, puts it away.
    const onClick = (event: MouseEvent) => {
      if (!narrow.matches || !details.open) return;
      const target = event.target as Element;
      if (!details.contains(target) || target.closest('a[href^="#"]')) details.open = false;
    };
    narrow.addEventListener('change', onWidth);
    details.addEventListener('toggle', onToggle);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      narrow.removeEventListener('change', onWidth);
      details.removeEventListener('toggle', onToggle);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // A page that is one of many of a kind brings its own kind into the list, under its group; the others stay out.
  const here = groups.flatMap((group) => group.pages).find((page) => page.path === current);
  const family = here?.family;
  // A kind with one page (a family of small entries that share it) needs no name over it.
  const kin = groups
    .flatMap((group) => group.pages)
    .filter((page) => family && page.family === family);

  return (
    <nav className={styles.root} aria-label="Docs">
      <DocsSearch className={styles.search} />
      {/* The script closes the list on a phone before paint, so the markup's `open` is not what the browser has. */}
      <details ref={menu} className={styles.menu} open suppressHydrationWarning>
        <summary className={styles.toggle}>
          <Icon name="contents" />
          Contents
        </summary>
        <div ref={tree} className={styles.tree}>
          {sections.length > 0 && (
            <div className={styles.here}>
              <p className={styles.group} id="docs-nav-here">
                On this page
              </p>
              <nav aria-labelledby="docs-nav-here">
                <PageSections sections={sections} />
              </nav>
            </div>
          )}
          {groups.map((group) => (
            <Fragment key={group.name}>
              <p className={styles.group} id={`docs-nav-${group.name.toLowerCase()}`}>
                {group.name}
              </p>
              <ul className={styles.bare} aria-labelledby={`docs-nav-${group.name.toLowerCase()}`}>
                {group.pages
                  .filter((page) => !page.family)
                  .map((page) => (
                    <li key={page.path}>
                      {page.status === 'live' ? (
                        <a
                          className={styles.link}
                          href={sitePath(page.path)}
                          aria-current={page.path === current ? 'page' : undefined}
                        >
                          {page.title}
                        </a>
                      ) : (
                        <span className={styles.planned}>
                          {page.title}
                          <span className={styles.unseen}> (not written yet)</span>
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
              {family && here && group.pages.includes(here) && (
                <>
                  {kin.length > 1 && (
                    <p className={styles.family} id="docs-nav-family">
                      {family}
                    </p>
                  )}
                  <ul className={styles.bare} aria-label={family}>
                    {kin.map((page) => (
                      <li key={page.path}>
                        <a
                          className={styles.link}
                          href={sitePath(page.path)}
                          aria-current={page.path === current ? 'page' : undefined}
                        >
                          {page.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Fragment>
          ))}
          <p className={styles.legend} aria-hidden="true">
            The dimmer pages are not written yet.
          </p>
        </div>
      </details>
      <script dangerouslySetInnerHTML={{ __html: BEFORE_PAINT }} />
    </nav>
  );
}

export default DocsNav;
