import type { LoadState } from './LoadState';

/**
 * Snapshot of the slot registry suitable for the loading-bar UI and the
 * dev panel.
 *
 * "In flight" means `loading` or `committing`.  A `committing` slot still
 * blocks the loading-bar UI from fading out — the user perceives it as
 * "still working" right up to the moment the renderer has the new buffer.
 */
export type RegistrySnapshot = {
  slots: Array<{ name: string; state: LoadState<unknown> }>;
  totalLoadedBytes: number;
  totalExpectedBytes: number;
  inFlightCount: number;
};
