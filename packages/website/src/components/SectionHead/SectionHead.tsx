/*
 * SectionHead — a section's name with, optionally, a sentence or two beside it
 * (the children): the name in the left half and the words in the right half of
 * the page grid when wide, stacked when narrow. `narrow` breaks a short name
 * over two lines and gives the words the lead's measure, for a page whose
 * sections open on a full sentence.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './SectionHead.module.css';

type SectionHeadProps = { title: string; narrow?: boolean; children?: ReactNode };

function SectionHead({ title, narrow = false, children }: SectionHeadProps) {
  return (
    <div className={cx(styles.root, narrow && styles.narrow)}>
      <h2>{title}</h2>
      {children && <div className={styles.lead}>{children}</div>}
    </div>
  );
}

export default SectionHead;
