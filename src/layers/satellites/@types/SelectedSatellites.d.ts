/** SelectedSatellites — whether a satellite is selected or focused; what the asset row demands on. */
export type SelectedSatellites = {
  /** A satellite is selected or focused, whether or not the catalog has loaded yet. */
  any(): boolean;
  stop(): void;
};
