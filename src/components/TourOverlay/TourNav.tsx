// src/components/TourOverlay/TourNav.tsx
/**
 * TourNav — the centered navigation cluster at bottom-center: prev, the
 * pause button wrapping a live dwell-countdown ring, the stop button, and
 * next. Pause and stop are the two circular "media" controls and sit
 * adjacent; prev/next flank them as bare arrow buttons.
 *
 * Purely presentational. The cluster is visible during the establishing
 * fly too (the caption is not), so it is the one always-on control surface
 * of the overlay — and the only part that opts back into pointer events,
 * since the root layer is click-through.
 *
 * Each button + glyph is its own component (NavButton, Prev/Next/Stop/
 * Pause/PlayIcon) so the markup here is just the cluster's composition and
 * the one piece of real behaviour: the dwell ring.
 *
 * The dwell ring is a CSS-driven SVG sweep, not a React-animated value:
 * the depleting circle runs the `tourDeplete` keyframe over `dwellSec`,
 * paused when `paused`. The parent bumps `dwellNonce` on every fresh dwell
 * and passes it as the ring's React `key`, so a new beat's dwell remounts
 * the ring and restarts the sweep from full rather than resuming mid-arc.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import NavButton from './NavButton';
import PrevIcon from './PrevIcon';
import NextIcon from './NextIcon';
import PauseIcon from './PauseIcon';
import PlayIcon from './PlayIcon';
import StopIcon from './StopIcon';
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
      <NavButton
        onClick={onPrev}
        disabled={!canPrev}
        className={cx(!canPrev && styles.ghost)}
        ariaLabel="Previous beat"
      >
        <PrevIcon />
      </NavButton>

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
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>

      <button type="button" className={styles.stopWrap} onClick={onExit} aria-label="Exit tour">
        <StopIcon />
      </button>

      <NavButton onClick={onNext} ariaLabel="Next beat">
        <NextIcon />
      </NavButton>
    </div>
  );
}

export default TourNav;
