/**
 * StatusBar — top-left HUD text, surfaces only the *unhealthy* engine states.
 *
 * An earlier revision echoed every state including "WebGPU OK", which always
 * told the user what the painting canvas already showed and aged into noise.
 * The rule since: render only on `error`, where the user sees a black canvas
 * and needs to know why. Every other state renders `null` — `initializing` is
 * sub-second, `loading` has the LoadingBar, `ready` speaks for itself.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { EngineStatus } from '../../@types/engine/EngineStatus';
import styles from './StatusBar.module.css';

/** Props for StatusBar. */
type StatusBarProps = {
  /** The current engine status, read from the engine slice via `selectEngineStatus` (dispatched via `engineStatusChanged`). */
  status: EngineStatus;
};

export function StatusBar({ status }: StatusBarProps): ReactNode {
  if (status.kind !== 'error') return null;

  return (
    <div className={cx(styles.status, styles.error)} role="alert">
      ERROR: {status.message}
    </div>
  );
}
