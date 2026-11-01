/**
 * The `terrain-pick-marker` overlay's two numbers (see its tuning section); null with no
 * pick or no engaged body.
 */
export type TerrainPickMarkerReadout = {
  readonly heightM: number | null;
  readonly levelAtEye: number | null;
};
