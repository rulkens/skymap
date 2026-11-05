/**
 * ShotSummary — a card's captured shot with its lead facts beside it, one line
 * each. The body, star and structure cards share it so the shot-led top row is
 * drawn once.
 */

import type { ReactNode } from 'react';
import Thumbnail from '../Thumbnail/Thumbnail';
import styles from './ShotSummary.module.css';

export type ShotSummaryProps = {
  readonly url: string;
  readonly alt: string;
  readonly rows: readonly { readonly label: ReactNode; readonly value: ReactNode }[];
};

function ShotSummary({ url, alt, rows }: ShotSummaryProps): ReactNode {
  return (
    <div className={styles.root}>
      <Thumbnail url={url} alt={alt} />
      <div className={styles.summary}>
        {rows.map((row, i) => (
          <div key={i} className={styles.line}>
            <span>{row.label}</span> {row.value}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ShotSummary;
