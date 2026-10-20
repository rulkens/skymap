/*
 * ObjectList — one section of the object catalogue (data/objectCatalogue.ts):
 * its count, then a compact row for each object, with the name, its other
 * names, the id a link uses and the link itself. Each row is an anchor of its
 * own, so a page or the docs search can land on it; names weigh more in that
 * search than running text, since a name typed there is most likely looked
 * for here, and the spaces between a row’s parts keep them apart in the text
 * the search reads. ObjectFinder narrows the rows through the `data-object*`
 * hooks below; without script this is a plain list.
 */
import { appLink } from '../../data/appLink.ts';
import { OBJECT_ROWS, OBJECT_SECTIONS } from '../../data/objectCatalogue.ts';
import { objectSectionRows } from '../../utils/objectSectionRows.ts';
import { objectSubLists } from '../../utils/objectSubLists.ts';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './ObjectList.module.css';

type ObjectListProps = { section: string };

function ObjectList({ section: id }: ObjectListProps) {
  const section = OBJECT_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`ObjectList: no section "${id}"`);
  const rows = objectSectionRows(section, OBJECT_ROWS);
  const lists = objectSubLists(section, rows);

  return (
    <div className={styles.root} data-embed data-objects data-pagefind-weight="4">
      <p className={styles.count} data-object-count data-pagefind-ignore>
        {`${rows.length} ${rows.length === 1 ? section.one : section.many}`}
      </p>
      {lists.map((list, l) => (
        <div key={list.label ?? l} data-object-sub>
          {list.label && <h3>{list.label}</h3>}
          <ul>
            {list.rows.map((row) => (
              <li key={row.anchor} id={row.anchor} data-object>
                <span className={styles.name} data-object-name>
                  <b>{row.name}</b>{' '}
                  {row.aliases && <span className={styles.also}>{row.aliases.join(', ')}</span>}
                  {!section.split && row.parent && (
                    <span className={styles.also}>{row.parent}</span>
                  )}
                  {row.note && <span className={styles.also}>{row.note}</span>}
                </span>{' '}
                <code>{row.id}</code>
                {row.link ? (
                  <ViewLink
                    className={styles.open}
                    href={appLink(row.link)}
                    aria-label={`Open ${row.name} in the app`}
                    data-pagefind-ignore
                  >
                    Open
                  </ViewLink>
                ) : (
                  <span className={styles.none} data-pagefind-ignore>
                    By search
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default ObjectList;
