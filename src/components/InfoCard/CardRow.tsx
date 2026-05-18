/**
 * CardRow — one label/value row inside a detail card.  Label accepts JSX so
 * callers can wrap it in an InfoTip without sprouting a parallel component.
 */

import type { ReactNode } from 'react';
import styles from './DetailCard.module.css';

export type CardRowProps = {
  label: ReactNode;
  value: ReactNode;
};

export function CardRow({ label, value }: CardRowProps): ReactNode {
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
    </div>
  );
}
