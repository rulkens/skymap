/**
 * TourCaption — a beat's subtitles: the beat title as a small mono label, then
 * the narration one line at a time, bottom-centre.
 *
 * Line opacity is a pure function of the dwell clock (`useDwellElapsed`) over the
 * `lineSchedule` slices — not CSS animation delays, which the cinema recorder's
 * virtual time never elapses.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';
import { lineSchedule } from '../../utils/animation/lineSchedule';
import { useDwellElapsed } from '../../hooks/useDwellElapsed';
import { subtitleOpacity } from '../../utils/animation/subtitleOpacity';
import styles from './TourOverlay.module.css';

export type TourCaptionProps = {
  /**
   * Interactive-session chrome. `false` (cinema mode) drops the beat-counter
   * readout — a "02 / 14" reads as UI inside a recorded film — and sheds the
   * nav clearance (`captionNoChrome`).
   */
  readonly hasChrome?: boolean;
  readonly caption: BeatCaption;
  readonly index: number;
  readonly total: number;
  readonly dwellSec: number;
  readonly dwellNonce: number;
  readonly paused: boolean;
};

function TourCaption({
  hasChrome = true,
  caption,
  index,
  total,
  dwellSec,
  dwellNonce,
  paused,
}: TourCaptionProps): ReactNode {
  const readout = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const label = hasChrome ? `${caption.title} · ${readout}` : caption.title;
  const schedule = lineSchedule(caption.lines, dwellSec);
  const elapsed = useDwellElapsed(dwellNonce, paused);
  // jsdom has no matchMedia.
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  return (
    <div className={cx(styles.caption, !hasChrome && styles.captionNoChrome)}>
      <div className={styles.label}>{label}</div>
      <div className={styles.lines}>
        {caption.lines.map((line, i) => (
          <p
            key={line}
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
