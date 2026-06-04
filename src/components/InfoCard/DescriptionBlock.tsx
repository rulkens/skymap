/**
 * DescriptionBlock — collapsible italic prose with a "show more / show less"
 * toggle, stacked as a column so the toggle sits underneath the text rather
 * than floating to its right.
 *
 * Shared by GalaxyDetailCard (the famous-galaxy blurb) and PoiDetailCard (the
 * cluster / supercluster / void / group blurb). Both cards used to inline this
 * markup, but each chose a different wrapper — the galaxy card stacked it in a
 * column while the POI card borrowed the label/value CardRow shape, so the
 * "show more" affordance landed in a different place in each. Extracting it
 * here means the two cards read identically.
 *
 * Owns its own collapse state: each card mounts one block per description and
 * the expanded/collapsed flag is local UI, never lifted. The 5-line clamp and
 * the column layout live in DetailCard.module.css (.descCollapsed / .descBlock).
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import cx from 'classnames';
import styles from './DetailCard.module.css';

export type DescriptionBlockProps = {
  /** The prose to show — a curated blurb or auto-generated one-liner. */
  text: string;
};

export function DescriptionBlock({ text }: DescriptionBlockProps): ReactNode {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.descBlock}>
      <span
        className={cx(styles.cardValue, expanded ? styles.descExpanded : styles.descCollapsed)}
        style={{ fontStyle: 'italic' }}
      >
        {text}
      </span>
      <button
        type="button"
        className={styles.descToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'show less' : 'show more'}
      </button>
    </div>
  );
}
