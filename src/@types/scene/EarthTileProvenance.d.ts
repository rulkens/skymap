/** Where one tile band's pixels came from, so a stale or mis-licensed bake is
 *  diagnosable per band rather than per whole manifest. */
export type EarthTileProvenance = {
  readonly sourceId: string;
  readonly attribution: string;
  readonly vintage: string;
};
