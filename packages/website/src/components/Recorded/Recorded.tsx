/*
 * Recorded — a passage of the repository's licence record set apart from the
 * page's own words as a quotation: behind a rule, under a line that says
 * whose words they are. Inside it a holder's own words stand behind a
 * second, brighter rule.
 */
import type { ReactNode } from 'react';

import styles from './Recorded.module.css';

type RecordedProps = { children?: ReactNode };

function Recorded({ children }: RecordedProps) {
  return (
    <div className={styles.root} data-embed>
      <p className={styles.whose}>From our licence record</p>
      {children}
    </div>
  );
}

export default Recorded;
