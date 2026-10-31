/*
 * Steer — the phone-remote section's two blocks: what a presenter does, in order (the children: a heading and
 * its lines per step), strung on one line in Earth's blue from pairing to the computer it runs through, and
 * the `demo` beside it. Wide, five columns and six; narrow, the steps come first.
 */
import type { ReactNode } from 'react';

import styles from './Steer.module.css';

type SteerProps = { demo?: ReactNode; children: ReactNode };

function Steer({ demo, children }: SteerProps) {
  return (
    <div className={styles.root}>
      <div className={styles.track}>{children}</div>
      <div className={styles.demo}>{demo}</div>
    </div>
  );
}

export default Steer;
