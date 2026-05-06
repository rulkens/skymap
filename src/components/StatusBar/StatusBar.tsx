/**
 * StatusBar — top-left HUD text, surfaces only the *unhealthy* engine states.
 *
 * Pure presentational component — receives an `EngineStatus`, returns a
 * string-bearing div or `null`.  No state, no effects.
 *
 * ### What's surfaced (and why)
 *
 * Earlier revisions of this component echoed every engine state including
 * "WebGPU OK" once startup completed.  That readout always told the user
 * what they could already see (the canvas was painting galaxies) and
 * silently aged into noise — the StatusBar competed for attention with
 * the InfoCard, Settings panel, and the cosmic-web wedge itself.
 *
 * The current rule is simpler: **only render when something is wrong.**
 *
 *   initializing  → null  (sub-second WebGPU bootstrap; not worth telling)
 *   loading       → null  (the LoadingBar component shows live progress;
 *                          duplicating the text here would clutter)
 *   ready (real)  → null  (the canvas is painting; success is self-evident)
 *   ready (synth) → yellow warning  (all three real fetches failed; the
 *                          user sees procedural galaxies and might think
 *                          they're real — flag it)
 *   error         → red error  (GPU failed, fatal load error; the user
 *                          sees a black canvas and needs to know why)
 *
 * ### Why an explicit warning state for synthetic fallback
 *
 * Without telling the user, "synthetic fallback" looks like a real
 * catalogue rendered with abnormally clean geometry — they could spend
 * minutes wondering why everything's a perfect sphere.  Yellow text in
 * the corner is unobtrusive but unmistakable.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { EngineStatus } from '../../@types';
import styles from './StatusBar.module.css';

/** Props for StatusBar. */
type StatusBarProps = {
  /** The current engine status, driven by `createEngine`'s `onStatusChange` callback. */
  status: EngineStatus;
};

/**
 * Renders status text only when the engine reports a state worth
 * surfacing.  Returns `null` for healthy/transient states so the corner
 * stays clean.
 */
export function StatusBar({ status }: StatusBarProps): ReactNode {
  // Healthy states — nothing to show.  The LoadingBar handles "loading",
  // the canvas handles "ready", and "initializing" is sub-second.
  if (status.kind === 'initializing' || status.kind === 'loading') {
    return null;
  }
  if (status.kind === 'ready' && status.source !== 'synthetic') {
    return null;
  }

  // From here on we always render.  The two remaining branches both
  // surface something the user needs to know about.
  if (status.kind === 'error') {
    return (
      <div className={cx(styles.status, styles.error)} role="alert">
        ERROR: {status.message}
      </div>
    );
  }

  // status.kind === 'ready' && status.source === 'synthetic'
  return (
    <div className={cx(styles.status, styles.warning)} role="status">
      synthetic fallback — no real data files loaded
    </div>
  );
}
