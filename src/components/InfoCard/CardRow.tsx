/**
 * CardRow — a row inside a detail card.  Two variants share the component so
 * the cards compose from one row primitive:
 *   - default: a label/value pair (label accepts JSX so callers can wrap it in
 *     an InfoTip without a parallel component).
 *   - headline: a single full-width title cell, reusing the headlineRow +
 *     cardHeadline classes so a bare name (no source badge) lays out identically
 *     to the badge-bearing headlines the galaxy/structure cards build inline.
 */

import type { ReactNode } from 'react';
import styles from './DetailCard.module.css';

export type CardRowProps =
  | { type?: 'row'; label: ReactNode; value: ReactNode }
  | { type: 'headline'; children: ReactNode };

export function CardRow(props: CardRowProps): ReactNode {
  if (props.type === 'headline') {
    return (
      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>{props.children}</div>
      </div>
    );
  }
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{props.label}</span>
      <span className={styles.cardValue}>{props.value}</span>
    </div>
  );
}
