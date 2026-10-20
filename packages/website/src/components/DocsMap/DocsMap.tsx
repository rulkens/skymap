/*
 * DocsMap — the docs' front page: what they cover, search, and the whole tree
 * of the docs tree, one band to a group. A group's name and purpose stand
 * in the first three columns of the page grid and its pages in the other
 * nine, three to a row. A written page carries the ring, as every link to a
 * place does; a planned one is its name alone, dimmer, so the map is honest
 * about how much of it exists. Search is passed in as `search` (DocsSearch, an
 * island): a static component cannot hold one itself.
 */
import type { ReactNode } from 'react';

import type { DocsGroup } from '../../@types/DocsGroup.ts';
import { sitePath } from '../../utils/sitePath.ts';
import styles from './DocsMap.module.css';

type DocsMapProps = { groups: readonly DocsGroup[]; search?: ReactNode };

function DocsMap({ groups, search }: DocsMapProps) {
  return (
    <>
      <header className={styles.opening} data-opening>
        <h1>Docs</h1>
        <p className={styles.say}>
          Skymap is a free, open-source web app that draws the mapped universe in three dimensions
          at true scale. These pages document what it does, the data it is built from and how it
          draws that data.
        </p>
        {search}
      </header>

      <div className={styles.map}>
        {groups.map((group) => {
          const id = group.name.toLowerCase();
          return (
            <section
              key={group.name}
              className={styles.group}
              id={id}
              aria-labelledby={`${id}-name`}
            >
              <div className={styles.about}>
                <h2 id={`${id}-name`}>{group.name}</h2>
                {group.purpose && <p className={styles.purpose}>{group.purpose}</p>}
              </div>
              <ul className={styles.pages}>
                {group.pages
                  .filter((page) => !page.family)
                  .map((page) => (
                    <li key={page.path}>
                      {page.status === 'live' ? (
                        <a className={styles.link} href={sitePath(page.path)}>
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
            </section>
          );
        })}
      </div>
    </>
  );
}

export default DocsMap;
