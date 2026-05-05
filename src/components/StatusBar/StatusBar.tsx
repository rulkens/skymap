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
 * The bar is intentionally minimal as of the left-stack UI restructure:
 * point counts moved into `StatsPanel`, the FPS readout moved into
 * `StatsPanel`, and the "drag to orbit, wheel to zoom" hint moved into
 * `NavigationPanel`.  What's left is a pure engine-state readout —
 * initializing / loading / ready / error.
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
      // The 'ready' branch used to splice in a point count, an FPS reading,
      // and a "drag to orbit" hint — that telemetry now lives in StatsPanel
      // (counts, FPS) and NavigationPanel (gestures), so we keep just the
      // engine-state readout here.  The synthetic-fallback tag survives
      // because it's a meaningful state distinction (all three real fetches
      // failed) that doesn't fit naturally into either of the new panels.
      const suffix = status.source === 'synthetic' ? ' (synthetic fallback)' : '';
      return `WebGPU OK${suffix}`;
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
