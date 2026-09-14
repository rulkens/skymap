/**
 * AtmosphereDrawEntry — one atmosphere body resolved for this frame: the seeded
 * body, its `AtmosphereParams` row, and the pose-dependent values both consumers
 * need, derived ONCE by `atmosphereDrawList`. The sky-view bake and the shell
 * draw walk the SAME entries, so they cannot disagree on which bodies have a
 * live atmosphere this frame, nor on where it is. An entry exists only because
 * `ctx.bodyPose` returned a pose for its body, so the bake reads these fields
 * unguarded. `body` is `EarthBody | PlanetBody` for its authored identity alone;
 * the derivation reads only `id` + `radiusM`.
 */

import type { EarthBody } from '../../scene/EarthBody';
import type { PlanetBody } from '../../scene/PlanetBody';
import type { AtmosphereParams } from '../../scene/AtmosphereParams';
import type { Vec3 } from '../../math/Vec3';

export type AtmosphereDrawEntry = {
  readonly body: EarthBody | PlanetBody;
  readonly params: AtmosphereParams;
  /** Atmosphere-top radius in METRES (params.atmosphereTopKm × KM_TO_M). */
  readonly atmosphereTopM: number;
  /** Camera in body-local ATMOSPHERE-TOP-RADIUS units (bodySlabCamLocal). */
  readonly camLocal: Vec3;
  /** Sun direction in the body's local frame (sunDirLocal, unit). */
  readonly sunLocal: Vec3;
  /** Camera inside the shell's handoff ratio (isInsideAtmosphereShell(camLocal)). */
  readonly inside: boolean;
};
