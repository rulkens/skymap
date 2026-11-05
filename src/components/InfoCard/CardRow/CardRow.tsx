/**
 * CardRow — a row inside a detail card, in two variants: a label/value pair
 * (the label accepts JSX, so callers wrap it in an InfoTip), and the headline
 * name cell for the compact hover cards (detail cards' names live in
 * CardHeader). Each variant has its own outermost element, see CardRow.module.css.
 */

import type { ReactNode } from 'react';
import chrome from '../cardChrome.module.css';
import styles from './CardRow.module.css';

export type CardRowProps =
  | { type?: 'row'; label: ReactNode; value: ReactNode }
  | { type: 'headline'; children: ReactNode; badge?: ReactNode };

function CardRow(props: CardRowProps): ReactNode {
  if (props.type === 'headline') {
    return (
      <div className={styles.headline}>
        <div className={chrome.cardHeadline}>{props.children}</div>
        {props.badge != null && <span className={chrome.sourceBadge}>{props.badge}</span>}
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <span className={chrome.cardLabel}>{props.label}</span>
      <span className={chrome.cardValue}>{props.value}</span>
    </div>
  );
}

export default CardRow;
