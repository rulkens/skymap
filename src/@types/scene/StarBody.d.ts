/**
 * StarBody — a seeded scene body standing in for a star (the Sun included).
 *
 * Identity + photometry only, matching `PlanetBody`: the position lives in the
 * body's `BodyState`, seeded from `SCENE_ANCHORS`, never baked here. The star
 * layers draw `PositionedStar`, which pairs this record with the one frame's
 * resolved position.
 *
 * `absMag` drives the far point's brightness and size — the same
 * absolute-magnitude quantity the catalogue point cloud uses, so the LOD
 * crossover speaks one language — tinted by `color`, the blackbody colour of
 * `temperatureK` in linear RGB so it composites in the HDR pass. Up close the
 * star resolves into a lit sphere sized from `radiusM` (SI metres), converted
 * to draw space at render time.
 */

import type { Vec3 } from '../math/Vec3';

export type StarBody = {
  readonly id: string;
  readonly label: string;
  readonly absMag: number; // drives point brightness/size + LOD
  readonly color: Vec3; // blackbody colour from temperatureK, linear RGB
  readonly radiusM: number; // used once resolved to a sphere (the Sun)
  readonly oblateness?: number; // flattening (a−c)/a; absent ⇒ spherical; feeds per-axis MVP scale
};
