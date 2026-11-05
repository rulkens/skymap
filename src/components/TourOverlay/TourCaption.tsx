/**
 * TourCaption — a beat's subtitles: the beat title as a small mono label, then
 * the narration one line at a time, bottom-centre.
 *
 * Line opacity is a pure function of the dwell clock (`useDwellElapsed`) over the
 * `lineSchedule` slices, so a recorded take shows the same lines as a live run.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';
import { lineSchedule } from '../../utils/animation/lineSchedule';
import { useDwellElapsed } from '../../hooks/useDwellElapsed';
import { subtitleOpacity } from '../../utils/animation/subtitleOpacity';
import styles from './TourOverlay.module.css';

export type TourCaptionProps = {
  /** `false` (cinema mode): the nav is unmounted, so the caption sheds its nav clearance. */
  readonly hasChrome?: boolean;
  readonly caption: BeatCaption;
  readonly dwellSec: number;
  readonly dwellNonce: number;
  readonly paused: boolean;
};

function TourCaption({
  hasChrome = true,
  caption,
  dwellSec,
  dwellNonce,
  paused,
}: TourCaptionProps): ReactNode {
  const schedule = lineSchedule(caption.lines, dwellSec);
  const elapsed = useDwellElapsed(dwellNonce, paused);
  // jsdom has no matchMedia.
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  return (
    <div className={cx(styles.caption, !hasChrome && styles.captionNoChrome)}>
      <div className={styles.label}>{caption.title}</div>
      <div className={styles.lines}>
        {caption.lines.map((line, i) => (
          <p
            key={i}
            className={styles.line}
            style={{ opacity: subtitleOpacity(schedule[i]!, elapsed, reduced) }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export default TourCaption;
