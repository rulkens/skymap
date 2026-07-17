/**
 * partitionBodiesByPresentation — the ONE branch point deciding which layer
 * draws each seeded body this frame.
 *
 * Three layers consume opposite branches of one result: `bodyGlintsLayer` draws
 * the `glints` branch (sub-resolution additive point sprites in the HDR
 * accumulation), `planetsLayer` the `flat` branch (flat-lit albedo spheres in
 * the depth-bearing foreground), and `texturedBodiesLayer` the `textured` branch
 * (surface-mapped spheres in the same foreground). Because all three read THIS
 * partition and take one branch each, a body is a glint XOR flat XOR textured
 * **by construction** — every input body lands in exactly one array (disjoint)
 * and none is dropped (covering). That structural invariant — one partition
 * consumed three times, rather than three per-layer gates that could drift
 * apart — is what makes the descent handoff seamless: no frame can double-draw a
 * body or drop it at a threshold crossing.
 *
 * Earth is NOT in this list. It carries its own dedicated renderer
 * (`earthRenderer`, a planned atmosphere/day-night divergence), gated by the
 * same apparent-size test but drawn separately — so the caller passes the
 * non-Earth bodies (`state.data.bodies.planets`) and Earth rides `bodies.earth`.
 *
 * The per-body decision reuses the same apparent-size mechanism the stars and
 * galaxies use for their LOD promotion (`apparentSizePx` feeding a pixel
 * threshold): project the body's physical diameter at its camera distance into
 * pixels, then apply `BODY_GLINT_MAX_PX`. Textured-vs-flat is then a pure
 * registry-membership + residency test — never an `if (id === …)` chain. The
 * function stays pure (a function of the body list, the camera, the projection,
 * and the residency predicate) so it unit-tests headlessly, no GPU device or
 * engine state to stand up.
 */

import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';

/**
 * Apparent-diameter ceiling (px) below which a body demotes from a resolved
 * mesh to an additive glint. Equal to the `bodyGlint` scale-fade band's
 * `goneAt` (spec §9): the glint fades IN over 3→1 px while the mesh still draws
 * down to its `SUB_PIXEL_BODY_CULL_PX = 1` cull, so at 3 px the glint is ~0 and
 * the mesh carries — a smooth handoff, no pop. ONE constant, so the partition
 * boundary and the fade band cannot drift to different pixel sizes.
 */
export const BODY_GLINT_MAX_PX = 3;

/**
 * Split `bodies` into the `{ glints, flat, textured }` presentations for the
 * current camera. Seed order is preserved within each branch and the returned
 * arrays reference the input records (no copies) — the mesh layers compose MVPs
 * straight off `positionMpc`.
 *
 * `isTextureResident(id)` reports whether the body's surface texture is live on
 * the renderer (the `bodyTextures` slot's `current() != null`). A registry body
 * whose texture has not landed yet is `flat` — the flat albedo sphere IS the
 * placeholder, exactly as Earth shows mid-blue before Blue Marble arrives.
 *
 * A body the camera sits INSIDE (distance 0) resolves unconditionally: at zero
 * distance `apparentSizePx`'s divide-by-zero guard returns 0, which a bare size
 * test would misread as sub-pixel and demote to a glint — the same degenerate
 * guard `partitionStarsByResolution` and `planetsLayer` keep.
 */
export function partitionBodiesByPresentation(input: {
  bodies: readonly PlanetBody[];
  camPosMpc: Readonly<Vec3>;
  viewportHeightPx: number;
  fovYRad: number;
  isTextureResident: (id: string) => boolean;
}): { glints: readonly PlanetBody[]; flat: readonly PlanetBody[]; textured: readonly PlanetBody[] } {
  const { bodies, camPosMpc, viewportHeightPx, fovYRad, isTextureResident } = input;
  const glints: PlanetBody[] = [];
  const flat: PlanetBody[] = [];
  const textured: PlanetBody[] = [];

  for (const body of bodies) {
    const dx = body.positionMpc[0] - camPosMpc[0];
    const dy = body.positionMpc[1] - camPosMpc[1];
    const dz = body.positionMpc[2] - camPosMpc[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    // Physical diameter in kpc: radiusKm·2 → Mpc → kpc, every step through a
    // named SCALE_UNITS constant (no inline magic factors).
    const diameterKpc = (body.radiusKm * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
    const diameterPx = apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad });
    // Degenerate guard only (see the docblock) — no per-body special case.
    const resolved = distanceMpc <= 0 || diameterPx >= BODY_GLINT_MAX_PX;

    if (!resolved) {
      glints.push(body);
    } else if (bodyTextureSpec(body.id) !== null && isTextureResident(body.id)) {
      textured.push(body);
    } else {
      flat.push(body);
    }
  }

  return { glints, flat, textured };
}
