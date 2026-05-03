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
 * ### CSS dependency
 *
 * The outer `<div>` uses `id="status"` to pick up the fixed-position style
 * declared in `index.html`. Same class name as the original imperative code.
 */

import type { ReactNode } from 'react';
import type { EngineStatus } from '../engine';

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
  return (
    <div id="status">
      {statusText(status)}
    </div>
  );
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
      // Show the actual source so the user can immediately tell whether real
      // SDSS galaxies or the synthetic fallback are being rendered.
      const sourceLabel =
        status.source === 'sdss.bin'
          ? 'sdss.bin'
          : 'synthetic — sdss.bin not found';
      return (
        `WebGPU OK · ${status.count.toLocaleString()} points (${sourceLabel}) · drag to orbit, wheel to zoom`
      );
    }

    case 'error':
      return `ERROR: ${status.message}`;
  }
}
