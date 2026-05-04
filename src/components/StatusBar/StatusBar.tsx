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
  /**
   * Live total point count, summed from `onCloudReady` callbacks in App.tsx.
   *
   * Why this exists separately from `status.count`: the engine fires
   * `onStatusChange({ kind: 'ready', count })` exactly once, snapshotted at the
   * moment the render loop starts.  But `pointRenderer.upload()` is async (the
   * per-galaxy bake runs in a Web Worker), so when `ready` fires, only the
   * surveys whose bakes have finished are reflected in `renderer.totalCount()`.
   * The smaller surveys (2MRS, Famous) typically finish first; SDSS and GLADE
   * — by far the largest — show up seconds later via `onCloudReady`.
   *
   * Passing the live App-side sum here ensures the status bar reflects the
   * actual on-screen total as each survey lands, rather than freezing at
   * whatever subset had baked when `ready` fired.
   */
  liveCount?: number;
};

/**
 * Renders the top-left status bar text.
 *
 * @example
 * // In App.tsx:
 * <StatusBar status={status} liveCount={liveCount} />
 */
export function StatusBar({ status, liveCount }: StatusBarProps): ReactNode {
  return <div className={styles.status}>{statusText(status, liveCount)}</div>;
}

/**
 * Convert an `EngineStatus` discriminated union to a human-readable string.
 *
 * Using a plain function (not a lookup map) makes each branch explicit and
 * easy to extend. TypeScript exhaustiveness checking will warn if a new
 * `kind` variant is added to `EngineStatus` but not handled here.
 */
function statusText(status: EngineStatus, liveCount?: number): string {
  switch (status.kind) {
    case 'initializing':
      return 'initializing…';

    case 'loading':
      return 'loading SDSS data…';

    case 'ready': {
      // `liveCount` (driven by App.tsx's `onCloudReady` accumulator) is preferred
      // when present because it grows as each survey's async upload bake finishes
      // — see the `liveCount` prop docstring for the full rationale.  We fall
      // back to `status.count` (the engine's snapshot at render-loop start) only
      // if the live count hasn't been wired up, so the status bar still works
      // for tests / consumers that haven't supplied `liveCount`.
      //
      // `source` is the first-arrived cloud (engine sets it once, stays put).
      // We only flag the synthetic fallback explicitly because it implies all
      // three real fetches failed.  Real data (SDSS, 2MRS, GLADE, or any
      // combination) renders without a tag — the count itself is the proof.
      const count = liveCount ?? status.count;
      const suffix = status.source === 'synthetic' ? ' (synthetic fallback)' : '';
      return `WebGPU OK · ${count.toLocaleString()} points${suffix} · drag to orbit, wheel to zoom`;
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
