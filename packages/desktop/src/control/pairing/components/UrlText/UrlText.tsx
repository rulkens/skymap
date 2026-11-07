/** UrlText — an address in mono that wraps after a path's slash or before its #, never inside a code. */

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { urlLinePieces } from '../../utils/urlLinePieces';
import styles from './UrlText.module.css';

export type UrlTextProps = {
  readonly url: string;
};

function UrlText({ url }: UrlTextProps): ReactNode {
  return (
    <span className={styles.root}>
      {urlLinePieces(url).map((piece, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          <span className={styles.piece}>{piece}</span>
        </Fragment>
      ))}
    </span>
  );
}

export default UrlText;
