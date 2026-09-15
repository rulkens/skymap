/**
 * AtmosphereDrawEntry — one atmosphere body resolved for this frame by
 * `atmosphereDrawList` (see its header): the seeded body, its
 * `AtmosphereParams` row, and the pose-dependent values the sky-view bake and
 * the shell draw share. An entry exists only where `ctx.bodyPose` resolved, so
 * consumers read these fields unguarded.
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
