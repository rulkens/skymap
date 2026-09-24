/**
 * `BlackHoleRow` — one supermassive black hole in the scene: where it sits, how
 * heavy it is, when its lens draws, and its disk-emission parameters. Every
 * shared loop (lens pass, slab rows) iterates `BLACK_HOLES`, so a second hole
 * (M87*) is a second row, not code.
 */

import type { BlackHoleId } from '../../../@types/data/blackHole/BlackHoleId';
import type { PlaceId } from '../../../@types/scene/PlaceId';
import type { FadeBand } from '../../../@types/math/FadeBand';

export type BlackHoleRow = {
  readonly id: BlackHoleId;
  readonly anchorId: PlaceId; // the lens's pose key and slab host
  readonly massSolar: number; // solar masses; r_s = schwarzschildRadiusM(massSolar)
  // By reference: the sky capture holds the same object, so the lens can never
  // sample a cubemap its band did not capture into.
  readonly band: FadeBand;
  // The descent floor, in r_s: the camera may approach to 2 r_s, well inside
  // the Earth-tuned global SURFACE_STANDOFF_RADII (~1.0000024).
  readonly standoffRadii: number;
  // Arrival distance, in r_s, the user framed live (2026-09-01): outside the
  // descent floor and deep inside the lensing fade band.
  readonly focusDistanceRadii: number;
  readonly emission: {
    readonly innerRs: number; // Schwarzschild radii; inner edge of the accretion disc
    readonly outerRs: number; // Schwarzschild radii; photon ring / EHT imaging radius
    readonly inclinationRad: number; // radians; face-on view ≲30° per EHT observations
    readonly positionAngleRad: number; // radians; major-axis orientation angle (unconstrained, tuned for visual)
    readonly flickerAmp: number; // fractional brightness modulation (0..1)
    readonly flickerTimescaleS: number; // seconds; typical timescale of flicker variations
  };
};
