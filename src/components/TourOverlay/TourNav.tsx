// src/components/TourOverlay/TourNav.tsx
/**
 * TourNav — the centered navigation cluster at bottom-center: prev, the
 * pause button wrapping a live dwell-countdown ring, next, a hairline
 * divider, and exit.
 *
 * Purely presentational. The cluster is visible during the establishing
 * fly too (the caption is not), so it is the one always-on control surface
 * of the overlay — and the only part that opts back into pointer events,
 * since the root layer is click-through.
 *
 * The dwell ring is a CSS-driven SVG sweep, not a React-animated value:
 * the depleting circle runs the `tourDeplete` keyframe over `dwellSec`,
 * paused when `paused`. The parent bumps `dwellNonce` on every fresh dwell
 * and passes it as the ring's React `key`, so a new beat's dwell remounts
 * the ring and restarts the sweep from full rather than resuming mid-arc.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './TourOverlay.module.css';

export type TourNavProps = {
  readonly paused: boolean;
  readonly dwellSec: number;
  readonly dwellNonce: number;
  readonly canPrev: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onTogglePause: () => void;
  readonly onExit: () => void;
};

function TourNav({
  paused,
  dwellSec,
  dwellNonce,
  canPrev,
  onPrev,
  onNext,
  onTogglePause,
  onExit,
}: TourNavProps): ReactNode {
  return (
    <div className={styles.nav}>
      <button
        type="button"
        className={cx(styles.navBtn, !canPrev && styles.ghost)}
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous beat"
      >
        ◀
      </button>

      <button
        type="button"
        className={styles.pauseWrap}
        onClick={onTogglePause}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {/*
         * Keyed on the dwell nonce so a fresh dwell remounts the ring and
         * the sweep restarts from full. The depleting circle's duration is
         * the dwell length; pausing freezes the sweep in place.
         */}
        <svg
          key={dwellNonce}
          className={styles.ringSvg}
          width="40"
          height="40"
          viewBox="0 0 40 40"
          aria-hidden="true"
        >
          <circle className={styles.ringTrack} cx="20" cy="20" r="17" />
          <circle
            className={styles.ringFill}
            cx="20"
            cy="20"
            r="17"
            style={{
              animationDuration: `${dwellSec}s`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </svg>
        {paused ? (
          <span className={styles.playGlyph} aria-hidden="true" />
        ) : (
          <span className={styles.pauseGlyph} aria-hidden="true">
            <i />
            <i />
          </span>
        )}
      </button>

      <button type="button" className={styles.navBtn} onClick={onNext} aria-label="Next beat">
        ▶
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={cx(styles.navBtn, styles.exit)}
        onClick={onExit}
        aria-label="Exit tour"
      >
        ✕
      </button>
    </div>
  );
}

export default TourNav;
