/*
 * SourceTable — every data source, twice in the page and once on screen. Wide,
 * it is a table to read across, its rows laid on the page grid so its columns
 * are the page's; the ARIA roles keep it a table to a screen reader, since CSS
 * has taken the table display away. Narrow, the table is gone and the same
 * rows are a list of closed disclosures, a source's name and what it gives
 * showing: two dozen stacked tables were eleven phone screens. No script. The
 * children are notes on how to read it, set under a rule at its foot. A
 * source's name leads to its data page, which has its terms in full and the
 * link to the source itself.
 */
import type { ReactNode } from 'react';

import { DATA_SOURCES } from '../../data/dataSources.ts';
import { dataRowPath } from '../../utils/dataRowPath.ts';
import { sitePath } from '../../utils/sitePath.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './SourceTable.module.css';

type SourceTableProps = { children?: ReactNode };

// One count per source: what the app draws, or what the source holds where our build does not count.
const sources = DATA_SOURCES.map((row) => ({ ...row, count: row.drawn ?? row.rows }));
const groups = [...new Set(sources.map((row) => row.group))].map((name) => ({
  name,
  rows: sources.filter((row) => row.group === name),
}));
const COLUMNS = { release: 'Release / Paper', count: '# of objects', licence: 'Licence' } as const;

function SourceTable({ children }: SourceTableProps) {
  return (
    <>
      <table role="table" className={styles.table}>
        <caption className={styles.unseen}>
          Data sources in Skymap, as the code read them on 6 October 2026
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">
              Source
            </th>
            <th role="columnheader" scope="col">
              {COLUMNS.release}
            </th>
            <th role="columnheader" scope="col" className={styles.num}>
              {COLUMNS.count}
            </th>
            <th role="columnheader" scope="col">
              {COLUMNS.licence}
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody role="rowgroup" key={group.name}>
            <tr role="row" className={styles.group}>
              <th role="columnheader" scope="rowgroup" colSpan={4}>
                {group.name}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr role="row" key={row.id}>
                <th role="rowheader" scope="row">
                  <a href={sitePath(dataRowPath(row.entries))}>{row.name}</a>
                  <span className={styles.gives}>{row.gives}</span>
                </th>
                <td role="cell">{row.release}</td>
                <td role="cell" className={styles.num}>
                  {row.count ?? <span className={styles.unseen}>not counted</span>}
                </td>
                <td role="cell">
                  {row.licence}
                  <span className={styles.ways}>
                    <a className={styles.evidence} href={row.href}>
                      Its own site
                    </a>{' '}
                    <a className={styles.evidence} href={row.evidence}>
                      Our record
                    </a>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      <div className={styles.list}>
        {groups.map((group) => (
          <section key={group.name}>
            <h3>{group.name}</h3>
            {group.rows.map((row) => (
              <details key={row.id}>
                <summary className={styles.summary}>
                  <span>
                    <b>{row.name}</b>
                    <span className={styles.gives}>{row.gives}</span>
                  </span>
                </summary>
                <dl>
                  {(['release', 'count', 'licence'] as const).map(
                    (key) =>
                      row[key] && (
                        <div key={key}>
                          <dt>{COLUMNS[key]}</dt>
                          <dd>{row[key]}</dd>
                        </div>
                      ),
                  )}
                </dl>
                <p className={styles.links}>
                  <ObjLink size="small" href={sitePath(dataRowPath(row.entries))}>
                    {row.name}
                  </ObjLink>
                  <ObjLink size="small" href={row.href}>
                    Its own site
                  </ObjLink>
                  <ObjLink size="small" href={row.evidence}>
                    Our record
                  </ObjLink>
                </p>
              </details>
            ))}
          </section>
        ))}
      </div>
      {children && <div className={styles.notes}>{children}</div>}
    </>
  );
}

export default SourceTable;
