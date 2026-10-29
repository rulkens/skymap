/**
 * SelectedSatellites — the satellites the camera may follow: the selected and focused ones. Each
 * holds a transient position while it stays selected; `any` is what the asset row demands on.
 */
export type SelectedSatellites = {
  /** A satellite is selected or focused, whether or not the catalog has loaded yet. */
  any(): boolean;
  /** Unsubscribes and drops every transient position it set. */
  stop(): void;
};
