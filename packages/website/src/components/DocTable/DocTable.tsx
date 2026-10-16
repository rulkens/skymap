/*
 * DocTable — every table of a docs page: a Markdown table (its children) or,
 * as `<Table head={…} rows={…} />`, one fed from data. Each row is laid on the
 * text column's own grid columns by one of the layouts of @types/DocTableCols,
 * chosen by the number of columns unless `cols` names one, so tables with the
 * same headings share their column edges down a page. Under 700px a row is a
 * block: its first cell as its name, the others under it, led by their
 * headings. The roles say again what the elements are, because a row that is
 * a grid would otherwise stop being a table row to a screen reader.
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';

import type { DocCell } from '../../@types/DocCell';
import type { DocTableCols } from '../../@types/DocTableCols';
import { cx } from '../../utils/cx.ts';
import { slotHtml } from '../../utils/slotHtml.ts';
import { tableCells } from '../../utils/tableCells.ts';
import DocLink from '../DocLink/DocLink.tsx';
import Keys from '../Keys/Keys.tsx';
import UseTerms from '../UseTerms/UseTerms.tsx';
import View from '../View/View.tsx';
import styles from './DocTable.module.css';

type DocTableProps = {
  cols?: DocTableCols;
  head?: readonly string[];
  rows?: readonly (readonly DocCell[])[];
  children?: ReactNode;
};

// A cell of a Markdown table arrives as the HTML inside it.
type Cell = DocCell | { html: string };

// Ends every cell: the search index joins the words of neighbouring cells where nothing stands between them.
const SPACE = ' ';

const LAYOUT: Record<DocTableCols, string> = {
  '2 4': styles.twoFour!,
  '3 3': styles.threeThree!,
  '2 2 2': styles.twoTwoTwo!,
  '4 2': styles.fourTwo!,
  detail: styles.detail!,
  stack: styles.stack!,
  over: styles.over!,
};

function CellContent({ cell }: { cell: Exclude<DocCell, string> }) {
  if ('keys' in cell)
    return cell.keys.map((chord, k) => (
      <Fragment key={k}>
        {k > 0 && (k === cell.keys.length - 1 ? ' or ' : ', ')}
        <Keys of={chord} />
      </Fragment>
    ));
  if ('codes' in cell)
    return cell.codes.map((code, k) => (
      <Fragment key={k}>
        {k > 0 && ', '}
        <code className={styles.name}>{code}</code>
      </Fragment>
    ));
  if ('use' in cell) return <UseTerms use={cell.use} />;
  if ('href' in cell)
    return (
      <>
        <span className={styles.links}>
          <DocLink href={cell.href}>{cell.label}</DocLink>
        </span>
        {SPACE}
        {cell.sub && <small>{cell.sub}</small>}
      </>
    );
  if ('to' in cell)
    return (
      <View to={cell.to} query={cell.query}>
        {cell.label}
      </View>
    );
  if ('text' in cell)
    return (
      <>
        {cell.text}
        {SPACE}
        {cell.sub && <small>{cell.sub}</small>}
        {cell.code && <code className={styles.eg}>{cell.code}</code>}
      </>
    );
  return <code>{cell.code}</code>;
}

function DocTable({ cols: named, head: given, rows: data, children }: DocTableProps) {
  const fromSlot = data ? undefined : tableCells(slotHtml(children));
  const head: readonly Cell[] = given ?? fromSlot!.head.map((html) => ({ html }));
  const rows: readonly (readonly Cell[])[] =
    data ?? fromSlot!.rows.map((row) => row.map((html) => ({ html })));
  const labels = given ?? fromSlot!.head.map((html) => html.replace(/<[^>]+>/g, '').trim());
  // A name in code is never broken, so it can be wider than a name column: a table of such names sets each over its words.
  const coded = rows.some((row) => typeof row[0] === 'object' && 'codes' in row[0]);
  const cols = coded
    ? 'over'
    : (named ?? (head.length === 2 ? '2 4' : head.length === 3 ? '2 2 2' : 'stack'));
  // A table with no heading over its first column names its rows there: those cells are the rows' headers.
  const rowNames = labels[0] === '';

  return (
    <div className={cx(styles.root, LAYOUT[cols])} data-embed>
      <table role="table">
        <thead role="rowgroup">
          <tr role="row">
            {head.map((cell, i) => {
              if (rowNames && i === 0) return <td key={i} role="presentation" />;
              return typeof cell === 'object' && 'html' in cell ? (
                <th
                  key={i}
                  role="columnheader"
                  scope="col"
                  dangerouslySetInnerHTML={{ __html: cell.html + SPACE }}
                />
              ) : (
                <th key={i} role="columnheader" scope="col">
                  {cell as string}
                  {SPACE}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, r) => (
            <tr key={r} role="row">
              {row.map((cell, i) => {
                const Tag = rowNames && i === 0 ? 'th' : 'td';
                const own = {
                  role: Tag === 'th' ? 'rowheader' : 'cell',
                  scope: Tag === 'th' ? 'row' : undefined,
                  'data-label': i > 0 ? labels[i] : undefined,
                };
                if (typeof cell === 'object' && 'html' in cell)
                  return (
                    <Tag key={i} {...own} dangerouslySetInnerHTML={{ __html: cell.html + SPACE }} />
                  );
                return (
                  <Tag key={i} {...own}>
                    {typeof cell === 'string' ? cell : <CellContent cell={cell} />}
                    {SPACE}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DocTable;
