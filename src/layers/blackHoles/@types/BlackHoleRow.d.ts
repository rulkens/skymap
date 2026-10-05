/**
 * `BlackHoleRow` — one supermassive black hole in the scene: where it sits, how
 * heavy it is, when its lens draws, and how its far-field marker looks. Every
 * shared loop (lens pass, marker pass, slab rows) iterates `BLACK_HOLES`, so a
 * second hole (M87*) is a second row, not code. The pose key is derived from
 * `capture` (`blackHoleAnchorId`), not carried here — see deletion-audit N2.
 */

import type { BlackHoleId } from '../../../@types/data/blackHole/BlackHoleId';
import type { SkyCaptureKey } from '../../../@types/rendering/SkyCaptureKey';
import type { Vec3 } from '../../../@types/math/Vec3';

export type BlackHoleRow = {
  readonly id: BlackHoleId;
  readonly massSolar: number; // solar masses; r_s = schwarzschildRadiusM(massSolar)
  readonly capture: SkyCaptureKey; // which sky bake the lens samples and bands against
  // The descent floor, in r_s: the camera may approach to 2 r_s, well inside
  // the Earth-tuned global SURFACE_STANDOFF_RADII (~1.0000024).
  readonly standoffRadii: number;
  // Arrival distance, in r_s, the user framed live (2026-09-01): outside the
  // descent floor and deep inside the lensing fade band.
  readonly focusDistanceRadii: number;
  // A fixed marker tint, not a photometric measurement: a black hole has no
  // albedo to derive one from. Linear RGB.
  readonly glintTint: Readonly<Vec3>;
  readonly glintBaseIntensity: number; // marker brightness outside the lens band
};
