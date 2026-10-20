/**
 * DiskWalkInput — the geometry-bearing frame input the shared disk-planner walk
 * reads: camera, record sources, source mask, hoisted pixels-per-radian. Body
 * extras (the textured planner's `famousGalaxiesMeta` / `nowMs`) are not here;
 * each body intersects this type with its own frame input.
 *
 * `sourceOpacity` is the live survey-fade opacity (`fades.opacityOf` at the
 * frame's `nowMs`); each body reads it once per block in `beginBlock`, not per
 * row, since the row loop scales with ~2.5M rows.
 */

import type { GalaxyRecordSource } from '../../data/galaxyCatalog/GalaxyRecordSource';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { SourceType } from '../../data/SourceType';

export type DiskWalkInput = {
  readonly cam: OrbitCamera;
  readonly records: ReadonlyMap<SourceType, GalaxyRecordSource>;
  readonly sourceMask: number;
  readonly pxPerRad: number;
  readonly sourceOpacity: (source: SourceType) => number;
};
