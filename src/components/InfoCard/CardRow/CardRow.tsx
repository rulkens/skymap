/**
 * CardRow — a row inside a detail card.  Two variants share the component so
 * every card composes from one row primitive:
 *   - default: a label/value pair (label accepts JSX so callers can wrap it in
 *     an InfoTip without a parallel component).
 *   - headline: the card's name cell (headlineRow + cardHeadline), with an
 *     optional trailing source/category badge, for the compact hover cards
 *     (the detail cards' name lives in CardHeader).
 *
 * The two variants are mutually-exclusive render branches, so each has its own
 * outermost element (.root for the row, .headline for the headline) — see
 * CardRow.module.css.
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
