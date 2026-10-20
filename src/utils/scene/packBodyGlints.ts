/**
 * packBodyGlints — one 7-float glint record (camera-relative position, albedo tint,
 * brightness) per body whose brightness survives phase x near cross-fade x far dissolve.
 * A glint at or under `GLINT_MIN_BRIGHTNESS` adds no light, so it is never packed (the
 * opacity-0 house rule). The position is rebased on the eye in f64 before the renderer
 * narrows to f32: narrowing the raw AU-scale anchor would already have lost the low bits.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyState } from '../../@types/scene/BodyState';
import type { PlanetBody } from '../../@types/scene/PlanetBody';
import type { MeshBody } from '../../@types/scene/MeshBody';
import { GLINT_MIN_BRIGHTNESS } from '../../data/rendering/glintMinBrightness';
import { BODY_GLINT_INSTANCE_FLOATS } from '../../data/rendering/bodyGlintInstanceFloats';
import { bodyApparentDiameterPx } from './bodyApparentDiameterPx';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';
import { bodyGlintBrightnessOf } from './bodyGlintBrightnessOf';

/** Packs each glint above GLINT_MIN_BRIGHTNESS into `staging`; returns the count. */
export function packBodyGlints(
  staging: Float32Array,
  glints: readonly (PlanetBody | MeshBody)[],
  input: {
    readonly states: ReadonlyMap<string, BodyState>;
    readonly camPosMpc: Readonly<Vec3>;
    readonly pxPerRad: number;
    readonly backdropFade: number;
  },
): number {
  const { states, camPosMpc, pxPerRad, backdropFade } = input;
  // A full staging buffer drops the rest silently; callers size it for their roster.
  const capacity = Math.floor(staging.length / BODY_GLINT_INSTANCE_FLOATS);
  let count = 0;
  for (const body of glints) {
    if (count >= capacity) break;
    const positionMpc = states.get(body.id)!.positionMpc;
    const diameterPx = bodyApparentDiameterPx({
      positionMpc,
      radiusM: bodyFootprintRadiusM(body),
      camPosMpc,
      pxPerRad,
    });
    const brightness = bodyGlintBrightnessOf(
      body.albedo,
      positionMpc,
      camPosMpc,
      diameterPx,
      backdropFade,
    );
    if (brightness <= GLINT_MIN_BRIGHTNESS) continue;

    const base = count * BODY_GLINT_INSTANCE_FLOATS;
    staging[base + 0] = positionMpc[0] - camPosMpc[0];
    staging[base + 1] = positionMpc[1] - camPosMpc[1];
    staging[base + 2] = positionMpc[2] - camPosMpc[2];
    staging[base + 3] = body.albedo[0];
    staging[base + 4] = body.albedo[1];
    staging[base + 5] = body.albedo[2];
    staging[base + 6] = brightness;
    count++;
  }
  return count;
}
