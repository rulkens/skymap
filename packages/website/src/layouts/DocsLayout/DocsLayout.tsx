/*
 * DocsLayout — one docs page on the site's twelve columns: the docs' contents in
 * the first three, the text in the next six (seven until the window has room
 * for the third part), and the page's own headings in the last three when it
 * has four or more. Narrow, the contents are a bar that stays under the top
 * bar, with those headings at the head of its list. The page's place comes
 * from its row in data/docsTree.ts: the group over its title, previous and
 * next within the group, and the landing page it links back up to. The three
 * interactive parts (the contents, the list of the page's headings and the
 * figure sheet) are islands the page passes in as `nav`, `toc` and `sheet`.
 */
import type { MarkdownHeading } from 'astro';
import type { ReactNode } from 'react';

import DocBody from '../../components/DocBody/DocBody.tsx';
import ObjLink from '../../components/ObjLink/ObjLink.tsx';
import Sources from '../../components/Sources/Sources.tsx';
import { DOCS_TREE } from '../../data/docsTree.ts';
import { docsPlace } from '../../utils/docsPlace.ts';
import { landingLabel } from '../../utils/landingLabel.ts';
import { sitePath } from '../../utils/sitePath.ts';
import { tocSections } from '../../utils/tocSections.ts';
import { cx } from '../../utils/cx.ts';
import styles from './DocsLayout.module.css';

type DocsLayoutProps = {
  path: string;
  description: string;
  headings: readonly MarkdownHeading[];
  factIds: readonly string[];
  nav?: ReactNode;
  toc?: ReactNode;
  sheet?: ReactNode;
  children?: ReactNode;
};

function DocsLayout({
  path,
  description,
  headings,
  factIds,
  nav,
  toc,
  sheet,
  children,
}: DocsLayoutProps) {
  const { group, page, previous, next } = docsPlace(DOCS_TREE, path);
  const up = page.up ?? group.up;
  const turns = [
    { page: previous, rel: 'prev', label: 'Before this, in' },
    { page: next, rel: 'next', label: 'After this, in' },
  ].flatMap((turn) =>
    turn.page
      ? [{ ...turn, page: turn.page, label: `${turn.label} ${turn.page.family ?? group.name}` }]
      : [],
  );
  const hasToc = tocSections(headings).length > 0;

  return (
    <>
      <div className={styles.root}>
        {nav}

        <article
          className={styles.page}
          id="page"
          data-pagefind-body
          data-pagefind-meta={`group:${group.name}`}
        >
          <header className={styles.opening} data-opening>
            <p className={styles.where} data-pagefind-ignore="">
              <a href={sitePath('/docs/')}>Docs</a>
              <span aria-hidden="true">/</span>
              <a href={`${sitePath('/docs/')}#${group.name.toLowerCase()}`}>
                {group.name}
                <span className={styles.unseen}>, a group of the docs</span>
              </a>
            </p>
            <h1>{page.title}</h1>
            <p className={styles.lead}>{description}</p>
          </header>

          <DocBody>{children}</DocBody>

          <footer className={styles.footer} data-pagefind-ignore="">
            {turns.length > 0 && (
              <nav className={styles.turns} aria-label="Previous and next page">
                {turns.map((turn) => (
                  <p key={turn.rel} className={cx(styles.turn, turn.rel === 'next' && styles.next)}>
                    <span className={styles.label}>{turn.label}</span>
                    <ObjLink
                      className={styles.turnLink}
                      hang
                      rel={turn.rel}
                      href={sitePath(turn.page.path)}
                    >
                      {turn.page.title}
                    </ObjLink>
                  </p>
                ))}
              </nav>
            )}
            <div className={styles.links}>
              <ObjLink hang size="small" href={sitePath(up)}>
                {landingLabel(up)}
              </ObjLink>
              <ObjLink hang size="small" href={sitePath('/docs/')}>
                All of the docs
              </ObjLink>
            </div>
            <Sources ids={factIds} />
          </footer>
        </article>

        {hasToc && (
          <nav className={styles.toc} aria-labelledby="toc-label">
            <p className={styles.tocLabel} id="toc-label">
              On this page
            </p>
            {toc}
          </nav>
        )}
      </div>
      {sheet}
    </>
  );
}

export default DocsLayout;
