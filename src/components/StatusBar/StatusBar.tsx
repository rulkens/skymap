/**
 * StatusBar — top-left HUD text showing the engine's current state.
 *
 * This is a pure presentational component: it receives an `EngineStatus` value
 * and renders a string. No local state, no effects — just a function from
 * props to JSX.
 *
 * ### Why a separate component?
 *
 * The status bar text changes four times during startup (initializing → loading
 * → ready / error). Keeping it in its own component isolates those re-renders:
 * when `status` changes, only this component re-renders, not the entire `App`
 * tree. In practice the tree is small and this doesn't matter much, but it's a
 * good habit that scales when the tree grows.
 *
 * ### CSS
 *
 * Layout rules live in StatusBar.module.css alongside this file. The outer div
 * uses `styles.status` instead of `id="status"`.
 */

import type { ReactNode } from 'react';
import type { EngineStatus } from '../../@types';
import styles from './StatusBar.module.css';

/** Props for StatusBar. */
type StatusBarProps = {
  /** The current engine status, driven by `createEngine`'s `onStatusChange` callback. */
  status: EngineStatus;
};

/**
 * Renders the top-left status bar text.
 *
 * @example
 * // In App.tsx:
 * <StatusBar status={status} />
 */
export function StatusBar({ status }: StatusBarProps): ReactNode {
  return <div className={styles.status}>{statusText(status)}</div>;
}

/**
 * Convert an `EngineStatus` discriminated union to a human-readable string.
 *
 * Using a plain function (not a lookup map) makes each branch explicit and
 * easy to extend. TypeScript exhaustiveness checking will warn if a new
 * `kind` variant is added to `EngineStatus` but not handled here.
 */
function statusText(status: EngineStatus): string {
  switch (status.kind) {
    case 'initializing':
      return 'initializing…';

    case 'loading':
      return 'loading SDSS data…';

    case 'ready': {
      // `count` is the running total across every loaded survey; `source` is the
      // first-arrived cloud (engine sets it once, stays put — subsequent arrivals
      // bump the count via `onCloudReady`).  We only flag the synthetic fallback
      // explicitly because it implies all three real fetches failed.  Real data
      // (SDSS, 2MRS, GLADE, or any combination) renders without a tag — the
      // count itself is the proof.
      const suffix = status.source === 'synthetic' ? ' (synthetic fallback)' : '';
      return `WebGPU OK · ${status.count.toLocaleString()} points${suffix} · drag to orbit, wheel to zoom`;
    }

    case 'error':
      return `ERROR: ${status.message}`;

    default: {
      // Exhaustiveness check: TypeScript will error here if a new `kind` is
      // added to EngineStatus without a matching case above.
      const _exhaustive: never = status;
      return String(_exhaustive);
    }
  }
}
