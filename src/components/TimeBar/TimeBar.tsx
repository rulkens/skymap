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
 * way back to live. The `now` button is always mounted; live mode CSS-collapses
 * its wrapper (grid 1fr→0fr) and marks it `inert`, rather than conditionally
 * rendering it. Keeping the node alive lets the pill width *animate* the
 * hand-back-to-live moment — a React unmount would snap it, since the node is
 * gone before a transition can run — while `inert` preserves the "genuinely not
 * interactive when live" guarantee (unfocusable, out of the a11y tree).
 *
 * The step glyphs carry `aria-hidden` — the button's `aria-label` is the
 * accessible name, so screen readers announce "Slower" / "Faster" rather than a
 * chevron character.
 *
 * Slower/Faster disable at the ladder ends: a clamped step there used to silently
 * re-anchor a live clock into manual mode. Native `disabled` blocks the click and
 * drops the button from the tab order (and its `pointer-events: none` styling
 * suppresses the tooltip).
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
  readonly slowerDisabled?: boolean; // at the slowest detent — step is inert
  readonly fasterDisabled?: boolean; // at the fastest detent — step is inert
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
  slowerDisabled = false,
  fasterDisabled = false,
  onPlayPause,
  onNow,
  onReadoutClick,
  hidden = false,
}: TimeBarProps): ReactNode {
  // Placement is the bottom-right HUD rail, stacked under the ScaleBar with the
  // readout's right edge pinned at the corner (see .root / .pill).
  return (
    // Outer .root is the transparent hit surface at the full expanded width, so
    // sweeping the cursor into the empty region left of the readout still wakes
    // the reveal. The visible chrome lives on the inner .pill (row-reverse),
    // which holds the readout on the right and grows leftward on hover.
    <div
      className={cx(styles.root, styles[mode], hidden && styles.hidden)}
      aria-hidden={hidden || undefined}
      role="toolbar"
      aria-label="Time controls"
    >
      <div className={styles.pill}>
        <button
          type="button"
          className={styles.readout}
          onClick={onReadoutClick}
          aria-label={`Set date and time (currently ${readout})`}
        >
          {readout}
          <span className={styles.tooltip} aria-hidden="true">
            Set date &amp; time
          </span>
        </button>

        {/* Grid 0fr→1fr collapses the controls' layout width so the pill hugs the
            readout; the inner .group is clipped horizontally while its tooltips
            escape upward. The pill's row-reverse puts this block left of the
            readout, so the group is authored in its left-to-right visual order:
            Now | rate | ‹ ⏯ › | (divider abutting the readout). */}
        <div className={styles.controls}>
          <div className={styles.group}>
            {/* Now collapser: the button is always mounted so the pill width can
                animate the hand-back-to-live moment. The same grid 1fr→0fr trick
                as .controls folds it (with the inner min-width:0 + horizontal
                clip) when live; `inert` keeps the folded button + its divider
                unfocusable and out of the a11y tree. The trailing divider rides
                inside the collapser so folding Now never strands a stray rule +
                gap against the rate label. */}
            <div
              className={cx(styles.nowCollapse, mode === 'live' && styles.nowCollapsed)}
              inert={mode === 'live'}
            >
              <div className={styles.nowInner}>
                <Button className={styles.now} onClick={onNow} aria-label="Return to now">
                  Now
                  <span className={styles.tooltip} aria-hidden="true">
                    Back to now
                  </span>
                </Button>
                <span className={styles.divider} aria-hidden="true" />
              </div>
            </div>

            <span className={styles.rate}>{rateLabel}</span>

            <span className={styles.divider} aria-hidden="true" />

            <Button
              className={styles.step}
              onClick={onSlower}
              disabled={slowerDisabled}
              aria-label="Slower"
            >
              <span aria-hidden="true">‹</span>
              <span className={styles.tooltip} aria-hidden="true">
                Slower
              </span>
            </Button>

            <Button
              className={styles.step}
              onClick={onPlayPause}
              aria-label={paused ? 'Play' : 'Pause'}
              aria-pressed={!paused}
            >
              <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
              <span className={styles.tooltip} aria-hidden="true">
                {paused ? 'Run time' : 'Pause time'}
              </span>
            </Button>

            <Button
              className={styles.step}
              onClick={onFaster}
              disabled={fasterDisabled}
              aria-label="Faster"
            >
              <span aria-hidden="true">›</span>
              <span className={styles.tooltip} aria-hidden="true">
                Faster
              </span>
            </Button>

            <span className={styles.divider} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimeBar;
