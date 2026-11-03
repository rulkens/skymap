/* CellContent — a DocTable cell fed from data rather than Markdown: keys, names in code, terms, a link, a view or words. */
import { Fragment } from 'react';

import type { DocCell } from '../../../@types/DocCell';
import DocLink from '../DocLink/DocLink.tsx';
import Keys from '../Keys/Keys.tsx';
import UseTerms from '../UseTerms/UseTerms.tsx';
import View from '../View/View.tsx';
import { SPACE } from './DocTable.constants.ts';
import styles from './DocTable.module.css';

type CellContentProps = { cell: Exclude<DocCell, string> };

function CellContent({ cell }: CellContentProps) {
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

export default CellContent;
