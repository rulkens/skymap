/*
 * Step — one step of a Steps list: its number, large and dim, its name, and
 * its words (the children), under the rule that heads the column.
 */
import type { ReactNode } from 'react';

import styles from './Step.module.css';

type StepProps = { title: string; children: ReactNode };

function Step({ title, children }: StepProps) {
  return (
    <li className={styles.root}>
      <h3>{title}</h3>
      {children}
    </li>
  );
}

export default Step;
