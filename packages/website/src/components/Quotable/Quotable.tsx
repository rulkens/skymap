/*
 * Quotable — the paragraph people quote: set large, at a measure a quote box
 * can hold.
 */
import type { ReactNode } from 'react';

import styles from './Quotable.module.css';

type QuotableProps = { children: ReactNode };

function Quotable({ children }: QuotableProps) {
  return <p className={styles.root}>{children}</p>;
}

export default Quotable;
