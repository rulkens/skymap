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
 * pixels, then apply `BODY_GLINT_MAX_PX`. The diameter reads the body's live
 * position from the per-frame `bodyStates` snapshot (keyed by id), NOT a baked
 * record field, so the split tracks the clock. Textured-vs-flat is then a pure
 * registry-membership + residency test — never an `if (id === …)` chain. The
 * function stays pure (a function of the body list, the body-state snapshot, the
 * camera, the projection, and the residency predicate) so it unit-tests
 * headlessly, no GPU device or engine state to stand up.
 */

import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';

/**
 * Apparent-diameter threshold (px): a body renders as a resolved mesh at/above
 * it and as an additive glint below it — a hard XOR, never both. Equal to the
 * `bodyGlint` scale-fade band's `goneAt` (spec §9): the glint carries the whole
 * 1–3 px band, its fade ramping to ~0 by 3 px so that at the crossover the glint
 * is already invisible and the mesh takes over with no pop. ONE constant, so the
 * partition boundary and the fade band cannot drift to different pixel sizes.
 */
export const BODY_GLINT_MAX_PX = 3;

/**
 * Split `bodies` into the `{ glints, flat, textured }` presentations for the
 * current camera. Seed order is preserved within each branch and the returned
 * arrays reference the input identity records (no copies) — the mesh layers
 * resolve each body's live position/orientation from the same `bodyStates`
 * snapshot, keyed by id.
 *
 * `isTextureResident(id)` reports whether a real surface texture is BOUND for the
 * body — a rendering fact asked of the renderer, never inferred from the loading
 * system (`sceneBodyPartition` binds it to `texturedBodyRenderer.hasMap`). A
 * registry body with nothing bound but the shared 1×1 is `flat` — the flat albedo
 * sphere IS the placeholder, exactly as Earth shows mid-blue before Blue Marble
 * arrives.
 *
 * A body the camera sits INSIDE (distance 0) resolves unconditionally:
 * `bodyApparentDiameterPx` returns `Infinity` at distance 0 (the camera is
 * inside the body, maximally resolved), which clears the `BODY_GLINT_MAX_PX`
 * threshold so the body is a mesh, never a glint. That degenerate case lives in
 * the shared projection helper, so every LOD gate reading it (this partition,
 * `partitionStarsByResolution`, the planet layers) gets the right answer with a
 * plain `>= threshold` comparison and no per-site branch.
 */
export function partitionBodiesByPresentation(input: {
  bodies: readonly PlanetBody[];
  bodyStates: ReadonlyMap<string, BodyState>;
  camPosMpc: Readonly<Vec3>;
  viewportHeightPx: number;
  fovYRad: number;
  isTextureResident: (id: string) => boolean;
}): {
  glints: readonly PlanetBody[];
  flat: readonly PlanetBody[];
  textured: readonly PlanetBody[];
} {
  const { bodies, bodyStates, camPosMpc, viewportHeightPx, fovYRad, isTextureResident } = input;
  const glints: PlanetBody[] = [];
  const flat: PlanetBody[] = [];
  const textured: PlanetBody[] = [];

  for (const body of bodies) {
    // Shared projection: apparent diameter in px, Infinity when the camera sits
    // inside the body (that degenerate case is owned by the util, so no per-body
    // branch here). A body resolves to a mesh at/above BODY_GLINT_MAX_PX.
    const diameterPx = bodyApparentDiameterPx({
      // Live position from the per-frame snapshot (keyed by id), not a baked
      // record field. Every seeded body has a snapshot state, so the lookup holds.
      positionMpc: bodyStates.get(body.id)!.positionMpc,
      radiusM: body.radiusM,
      camPosMpc,
      viewportHeightPx,
      fovYRad,
    });
    const resolved = diameterPx >= BODY_GLINT_MAX_PX;

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
