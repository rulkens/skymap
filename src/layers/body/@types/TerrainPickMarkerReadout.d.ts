/**
 * The two numbers the `terrain-pick-marker` overlay exists to compare: the CPU's ground
 * height under the cursor pick, and the pyramid level the height under the eye came from
 * (a shallow level is the tell for a CPU/GPU level disagreement). Null with no pick or no
 * engaged body.
 */
export type TerrainPickMarkerReadout = {
  readonly heightM: number | null;
  readonly levelAtEye: number | null;
};
