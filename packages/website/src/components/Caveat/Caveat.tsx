/*
 * Caveat — an admission set apart from a section's claims: where something
 * falls short, or is planned and not yet true. Its name and its words
 * stand behind a rule in the accent, not in a box. `landing` is for a
 * landing page's section; in the docs and the data pages it keeps the text's rhythm.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Caveat.module.css';

type CaveatProps = { title: string; landing?: boolean; children?: ReactNode };

function Caveat({ title, landing = false, children }: CaveatProps) {
  return (
    <div className={cx(styles.root, landing && styles.landing)} data-embed>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default Caveat;
