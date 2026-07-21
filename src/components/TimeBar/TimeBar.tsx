// src/components/TimeBar/TimeBar.tsx
/**
 * TimeBar — the sim clock's transport instrument.
 *
 * A pure presentational control: the current time readout, a rate stepper
 * (slower / faster), a play/pause toggle, the current rate label, and a
 * manual-mode "return to now" affordance. Every piece of state arrives as a
 * prop and every interaction leaves as a callback; the component reaches into
 * no store, engine, or clock module (Task 3's container wires those).
 *
 * ## Live vs manual
 *
 * In `live` mode the clock is pinned to real wall-time, so the bar collapses to
 * the readout alone and reveals its transport controls only on hover / focus —
 * the reveal is pure CSS (`:hover` / `:focus-within` on .root), which is why
 * it isn't (and can't be) unit-tested. In `manual` mode the user has taken the
 * wheel: the controls are always shown and the lit "now" button appears as the
 * way back to live. The `now` button renders only in manual mode by construction
 * (conditional render, not a CSS hide) so it's genuinely absent when live.
 *
 * The step glyphs carry `aria-hidden` — the button's `aria-label` is the
 * accessible name, so screen readers announce "Slower" / "Faster" rather than a
 * chevron character.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import Button from '../common/Button/Button';
import styles from './TimeBar.module.css';

export type TimeBarProps = {
  readonly readout: string; // preformatted UTC readout, from formatSimClock
  readonly rateLabel: string; // RATE_LADDER row label, e.g. '1 day/s'
  readonly mode: 'live' | 'manual';
  readonly paused: boolean;
  readonly onSlower: () => void; // step toward a slower rate  ( [ )
  readonly onFaster: () => void; // step toward a faster rate  ( ] )
  readonly onPlayPause: () => void; // toggle paused             ( \ )
  readonly onNow: () => void; // return to live wall-time  ( Shift+N )
  readonly onReadoutClick: () => void; // open the date-entry popover (Task 4)
  readonly hidden?: boolean; // App-layout gate, mirrors other HUD pills
};

function TimeBar({
  readout,
  rateLabel,
  mode,
  paused,
  onSlower,
  onFaster,
  onPlayPause,
  onNow,
  onReadoutClick,
  hidden = false,
}: TimeBarProps): ReactNode {
  // TODO(visual-gate): default placement is bottom-center (see .root). The open
  // question deferred to a USER VISUAL GATE is the final corner + clearances
  // against InfoCard (top-right), ScaleBar (bottom-right), and the left-stack
  // NavigationPanel — don't tune spacing blind.
  return (
    <div
      className={cx(styles.root, styles[mode], hidden && styles.hidden)}
      aria-hidden={hidden || undefined}
      role="toolbar"
      aria-label="Time controls"
    >
      <button
        type="button"
        className={styles.readout}
        onClick={onReadoutClick}
        aria-label={`Set date and time (currently ${readout})`}
      >
        {readout}
      </button>

      <div className={styles.controls}>
        <Button className={styles.step} onClick={onSlower} aria-label="Slower">
          <span aria-hidden="true">‹</span>
        </Button>

        <Button
          className={styles.step}
          onClick={onPlayPause}
          aria-label={paused ? 'Play' : 'Pause'}
          aria-pressed={!paused}
        >
          <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
        </Button>

        <Button className={styles.step} onClick={onFaster} aria-label="Faster">
          <span aria-hidden="true">›</span>
        </Button>

        <span className={styles.rate}>{rateLabel}</span>

        {mode === 'manual' && (
          <Button
            className={styles.now}
            variant="primary"
            onClick={onNow}
            aria-label="Return to now"
          >
            Now
          </Button>
        )}
      </div>
    </div>
  );
}

export default TimeBar;
