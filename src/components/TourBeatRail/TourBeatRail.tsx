// src/components/TourBeatRail/TourBeatRail.tsx
/**
 * TourBeatRail — the vertical dot progress rail on the right edge of the
 * viewport: one dot per beat, top = start, bottom = end.
 *
 * Pure orientation, deliberately NOT a scrubber: hovering a dot reveals that
 * beat's title (a null title is a silent beat and reveals nothing), but the
 * dots take no clicks and the cursor stays default. If the hover affordance
 * ever wants to become click-to-jump, the handler would dispatch the same
 * tour signals the keyboard uses — nothing here needs restructuring.
 *
 * Always visible while a tour runs (App gates the mount on `selectTourActive`),
 * including establishing flies — the rail is orientation like the nav, not
 * commentary like the caption, so it never waits for the dwell. The titles
 * are rendered unconditionally and shown via CSS `:hover`, keeping the
 * component state-free.
 *
 * The dots visually duplicate the caption's "01 / 14" readout, which remains
 * the screen-reader surface — hence one aria-label on the root and
 * aria-hidden rows.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './TourBeatRail.module.css';

export type TourBeatRailProps = {
  readonly titles: readonly (string | null)[];
  readonly index: number;
};

function TourBeatRail({ titles, index }: TourBeatRailProps): ReactNode {
  return (
    <div
      className={styles.root}
      aria-label={`Tour progress: beat ${index + 1} of ${titles.length}`}
    >
      {titles.map((title, i) => (
        <div
          // Beats are static for the life of a tour, so the index is a
          // stable key.
          key={i}
          className={cx(styles.row, i < index && styles.done, i === index && styles.current)}
          aria-hidden="true"
        >
          {title ? <span className={styles.title}>{title}</span> : null}
          <span className={styles.dot} />
        </div>
      ))}
    </div>
  );
}

export default TourBeatRail;
