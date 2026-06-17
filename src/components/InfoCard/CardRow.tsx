/**
 * CardRow — a row inside a detail card.  Two variants share the component so
 * every card composes from one row primitive:
 *   - default: a label/value pair (label accepts JSX so callers can wrap it in
 *     an InfoTip without a parallel component).
 *   - headline: the card's name cell (headlineRow + cardHeadline), with an
 *     optional trailing source/category badge.  One headline shape for the
 *     galaxy, structure, and Milky-Way cards — detail and hover alike.
 */

import type { ReactNode } from 'react';
import styles from './DetailCard.module.css';

export type CardRowProps =
  | { type?: 'row'; label: ReactNode; value: ReactNode }
  | { type: 'headline'; children: ReactNode; badge?: ReactNode };

export function CardRow(props: CardRowProps): ReactNode {
  if (props.type === 'headline') {
    return (
      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>{props.children}</div>
        {props.badge != null && <span className={styles.sourceBadge}>{props.badge}</span>}
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
