/*
 * MakerCount — the words about who makes Skymap (the children) on the left of the page grid, and beside them the
 * count of people who do, set as one huge numeral in the display face: type as the section's picture. The figure
 * comes from the data, and the words already say it, so the numeral is hidden from screen readers.
 */
import type { ReactNode } from 'react';

import { MAKER_COUNT } from '../../../../data/aboutFacts.ts';
import styles from './MakerCount.module.css';

type MakerCountProps = { children: ReactNode };

function MakerCount({ children }: MakerCountProps) {
  return (
    <div className={styles.root}>
      <div className={styles.words}>{children}</div>
      <p className={styles.count} aria-hidden="true">
        {MAKER_COUNT}
      </p>
    </div>
  );
}

export default MakerCount;
