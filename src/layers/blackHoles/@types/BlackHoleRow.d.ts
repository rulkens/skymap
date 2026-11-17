/**
 * `BlackHoleRow` — one supermassive black hole in the scene: where it sits, how
 * heavy it is, when its lens draws, and how its far-field marker looks. Every
 * shared loop (lens pass, marker pass, slab rows) iterates `BLACK_HOLES`, so a
 * second hole (M87*) is a second row, not code. The pose key is derived from
 * `capture` (`blackHoleAnchorId`), not carried here — see deletion-audit N2.
 */

import type { BlackHoleId } from './BlackHoleId';
import type { BLACK_HOLE_SKY_CAPTURES } from '../lensing/data/blackHoleSkyCaptures';
import type { Vec3 } from '../../../@types/math/Vec3';

export type BlackHoleRow = {
  readonly id: BlackHoleId;
  readonly massSolar: number; // solar masses; r_s = schwarzschildRadiusM(massSolar)
  // Which sky bake the lens samples and bands against.
  readonly capture: keyof typeof BLACK_HOLE_SKY_CAPTURES;
  // The descent floor, in r_s: the camera may approach to 2 r_s, well inside
  // the Earth-tuned global SURFACE_STANDOFF_RADII (~1.0000024).
  readonly standoffRadii: number;
  // A fixed marker tint, not a photometric measurement: a black hole has no
  // albedo to derive one from. Linear RGB.
  readonly glintTint: Readonly<Vec3>;
  readonly glintBaseIntensity: number; // marker brightness outside the lens band
};
