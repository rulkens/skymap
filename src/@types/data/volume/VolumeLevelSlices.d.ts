/** One stored level as z-slices: the bytes of one slice and how many there are. */
export type VolumeLevelSlices = {
  readonly sliceBytes: number;
  readonly depth: number;
};
