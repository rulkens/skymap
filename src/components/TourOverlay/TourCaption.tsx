/**
 * TourCaption — a beat's subtitles: the beat title as a small mono label, then
 * the narration one line at a time, bottom-centre.
 *
 * Line changes are CSS animations whose delay/duration come from `lineSchedule`,
 * keyed on `dwellNonce` and frozen by `paused` — the same mechanism as the dwell
 * ring in TourNav, so the lines and the ring can never disagree about the dwell.
 */

import type { CSSProperties, ReactNode } from 'react';
import cx from 'classnames';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';
import { lineSchedule } from '../../utils/animation/lineSchedule';
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

  return (
    <div className={cx(styles.caption, !hasChrome && styles.captionNoChrome)}>
      <div className={styles.label}>{label}</div>
      <div className={styles.lines} key={dwellNonce}>
        {caption.lines.map((line, i) => {
          const { startSec, endSec } = schedule[i]!;
          const style: CSSProperties = {
            animationDelay: `${startSec}s`,
            animationDuration: `${endSec - startSec}s`,
            animationPlayState: paused ? 'paused' : 'running',
          };
          return (
            <p key={line} className={styles.line} style={style}>
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default TourCaption;
