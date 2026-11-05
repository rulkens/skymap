/**
 * DiskWalkInput — the geometry-bearing frame input the shared disk-planner walk
 * reads: camera, record sources, visible catalog ids, hoisted pixels-per-radian. Body
 * extras (the textured planner's `famousGalaxiesMeta` / `nowMs`) are not here;
 * each body intersects this type with its own frame input.
 *
 * `sourceOpacity` is the live survey-fade opacity (`fades.opacityOf` at the
 * frame's `nowMs`); each body reads it once per block in `beginBlock`, not per
 * row, since the row loop scales with ~2.5M rows.
 */

import type { GalaxyRecordSource } from '../../records/@types/GalaxyRecordSource';
import type { OrbitCamera } from '../../../../@types/camera/orbitCamera/OrbitCamera';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';

export type DiskWalkInput = {
  readonly cam: OrbitCamera;
  readonly records: ReadonlyMap<GalaxyCatalogSourceType, GalaxyRecordSource>;
  readonly visibleCatalogs: ReadonlySet<GalaxyCatalogId>;
  readonly pxPerRad: number;
  readonly sourceOpacity: (source: GalaxyCatalogSourceType) => number;
};
