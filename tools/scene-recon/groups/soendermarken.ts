/**
 * The Søndermarken scene group — anchor, crop bounds, and DHM tile list the
 * fetch/bake CLIs read (`data/raw/dhm/README.md` is their provenance).
 *
 * `minPointSpacingM` exists to cap density: DHM/Punktsky is ~4-5 pts/m², so
 * the README bbox at native density is ~20M points ≈ 320MB at the 16-byte
 * point stride; Poisson-thinning to `filters.sample` at 1m lands ~4.5M
 * points ≈ 72MB, which localhost serves and a browser parses without
 * ceremony.
 */
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

export type SceneGroupDefinition = {
  readonly id: string;
  readonly name: string;
  readonly anchor: GroupAnchor;
  /** Crop bounds, WGS84 degrees — applied before colorization, in the ortho's own frame. */
  readonly bounds: LonLatBounds;
  /** DHM 1 km tile names to fetch (task 1's list). */
  readonly dhmTiles: readonly string[];
  /** `filters.sample` radius, metres — the density cap that keeps points.bin loadable. */
  readonly minPointSpacingM: number;
  /** ASPRS classes dropped before packing (7 = low noise, 18 = high noise). */
  readonly dropClassifications: readonly number[];
};

export const SOENDERMARKEN: SceneGroupDefinition = {
  id: 'soendermarken',
  name: 'Søndermarken',
  anchor: {
    kind: 'geodetic',
    latDeg: 55.67,
    lonDeg: 12.53,
    heightMDvr90: 18.5,
    headingDeg: 0,
  },
  bounds: {
    west: 12.51,
    south: 55.662,
    east: 12.55,
    north: 55.678,
  },
  dhmTiles: [
    'punktsky_1km_6174_720',
    'punktsky_1km_6174_721',
    'punktsky_1km_6174_722',
    'punktsky_1km_6174_723',
    'punktsky_1km_6175_720',
    'punktsky_1km_6175_721',
    'punktsky_1km_6175_722',
    'punktsky_1km_6175_723',
  ],
  minPointSpacingM: 1.0,
  dropClassifications: [7, 18],
};
