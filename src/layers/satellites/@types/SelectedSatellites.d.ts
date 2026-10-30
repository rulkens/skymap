/**
 * SelectedSatellites — the selected and focused satellites, for the orbit rings; `any` is what the
 * asset row demands on.
 */
import type { TrackedSatellite } from './TrackedSatellite';

export type SelectedSatellites = {
  /** A satellite is selected or focused, whether or not the catalog has loaded yet. */
  any(): boolean;
  /** The ones the loaded catalog holds; the same array until the set changes. */
  tracked(): readonly TrackedSatellite[];
  /** Unsubscribes and empties `tracked`. */
  stop(): void;
};
