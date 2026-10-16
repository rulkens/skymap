/*
 * Caveat — an admission set apart from a section's claims: where something
 * falls short, or is planned and not yet true. Its name and its words
 * stand behind a rule in the accent, not in a box.
 */
import type { ReactNode } from 'react';

import styles from './Caveat.module.css';

type CaveatProps = { title: string; children?: ReactNode };

function Caveat({ title, children }: CaveatProps) {
  return (
    <div className={styles.root} data-embed>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default Caveat;
