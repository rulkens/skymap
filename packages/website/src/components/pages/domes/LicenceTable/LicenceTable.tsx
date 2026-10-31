/*
 * LicenceTable — what paid dome work may show, as a ledger: each source, its licence, and what a paid show
 * needs before it uses it (domes.data.ts). A source the site has a page for links there; a row whose terms
 * limit paid use is marked by its words, and by an open ring in the margin as well. On a phone each row
 * stacks, its cells named by their column (`data-label`).
 */
import { LICENCE_ROWS } from '../../../../content/pages/domes/domes.data.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import styles from './LicenceTable.module.css';

const href = (path: string) => (path.startsWith('/') ? sitePath(path) : path);

function LicenceTable() {
  return (
    <div className={styles.root}>
      <table>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Licence</th>
            <th scope="col">For a paid show</th>
          </tr>
        </thead>
        <tbody>
          {LICENCE_ROWS.map((row) => (
            <tr key={row.source} data-free={row.licence === 'MIT' ? '' : undefined}>
              <th scope="row">
                {'href' in row ? <a href={href(row.href)}>{row.source}</a> : row.source}
              </th>
              <td data-label="Licence">{row.licence}</td>
              <td data-label="For a paid show">{row.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LicenceTable;
