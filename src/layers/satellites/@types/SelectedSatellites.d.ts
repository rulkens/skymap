/**
 * SelectedSatellites — the satellites the camera may follow: the selected and focused ones. Each
 * holds a transient position while it stays selected; `any` is what the asset row demands on.
 */
import type { TrackedSatellite } from './TrackedSatellite';

export type SelectedSatellites = {
  /** A satellite is selected or focused, whether or not the catalog has loaded yet. */
  any(): boolean;
  /** The ones positioned now, for the orbit rings; the same array until the set changes. */
  tracked(): readonly TrackedSatellite[];
  /** Unsubscribes and drops every transient position it set. */
  stop(): void;
};
