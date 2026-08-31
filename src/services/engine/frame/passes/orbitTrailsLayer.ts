/**
 * orbitTrailsLayer — Keplerian orbit trails (Earth / Jupiter / Moon) as additive
 * screen-space conics. Drawn through NEAR0 because AU-to-lunar orbits sit far
 * inside COSMO's 0.01 Mpc near plane, while still accumulating into HDR.
 *
 * HARD INVARIANT: `composeOrbitConic` takes `view.slab.vp`, NOT `view.vp`. It
 * assembles and INVERTS the homography in f64 to resolve the cancellation between
 * the ~1e-12 Mpc centres and the vp's large translation column; fed the narrowed
 * `view.vp` it misplaces a trail by far more than its stroke width.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { ORBITAL_ELEMENTS } from '../../../../data/bodies/orbitalElements';
import { SCENE_ANCHORS } from '../../../../data/bodies/sceneAnchors';
import { focusResolveOrder } from '../../../../utils/scene/focusResolveOrder';
import { regionOfBody } from '../../../../utils/scene/regionOfBody';
import { regionRelativeDistanceMpc } from '../../../../utils/scene/regionRelativeDistanceMpc';
import type { AnchorBody } from '../../../../@types/scene/AnchorBody';
import type { BodyRegion } from '../../../../@types/scene/BodyRegion';
import type { OrbitalElements } from '../../../../@types/scene/OrbitalElements';
import { propagateElements } from '../../../../utils/orbit/propagateElements';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { sceneBodyStates } from '../sceneBodyStates';
import { INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/orbitTrailRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

// Apparent-size fade band, in on-screen orbit DIAMETER pixels. Below CULL_PX an
// orbit is deep sub-pixel noise (aliasing, not a legible path), so it is dropped
// from the draw entirely; from CULL_PX up to FULL_PX its brightness ramps in, so
// it does not pop into existence. Kpc because apparentSizePx wants a kpc diameter
// (1 Mpc = 1000 kpc).
const CULL_PX = 10;
const FULL_PX = 20;

// Reused across frames so the hot path allocates nothing. Sized from the
// compile-time elements table — a fixed size, not a cap.
const staging = new Float32Array(ORBITAL_ELEMENTS.length * INSTANCE_FLOATS);

// Farthest point from the focus is apoapsis a·(1+e); summing it along the focus
// chain bounds every orbit point for every t. Derived from the static elements,
// NOT the conic CENTRES — a moon centre rides its moving parent, so a
// centre-derived bound goes stale the moment the clock runs.
function apoapsisMpc(elements: OrbitalElements): number {
  return elements.semiMajorMpc * (1 + elements.eccentricity);
}

/**
 * Each region's orbital reach FROM ITS OWN ANCHOR, over ALL clock times — a
 * TIME-INVARIANT outer envelope.
 *
 * Per region, not one scene-wide maximum, because a reach is only ever subtracted
 * from a camera distance measured against the SAME anchor. The two collapse into
 * one number only while every orbit hangs off the origin-anchored Sun; fold a
 * Galactic Centre orbit into a single maximum and the solar-system trails inherit
 * ITS envelope, so `enabled`'s cull stops firing for cameras nowhere near it.
 *
 * The tables are parameters so the far-anchored case is testable before such an
 * orbit is seeded; `focusResolveOrder` covers a focus chain of any depth.
 */
export function orbitReachByRegion(
  anchors: readonly AnchorBody[],
  elements: readonly OrbitalElements[],
  regionOf: (bodyId: string) => BodyRegion | null,
): ReadonlyMap<BodyRegion, number> {
  const reachMpc = new Map<string, number>();
  // An anchor has no orbit of its own to extend the envelope.
  for (const anchor of anchors) reachMpc.set(anchor.id, 0);
  for (const el of focusResolveOrder(anchors, elements)) {
    reachMpc.set(el.id, apoapsisMpc(el) + reachMpc.get(el.focusId)!);
  }
  const byRegion = new Map<BodyRegion, number>();
  for (const el of elements) {
    const region = regionOf(el.id);
    if (region === null) continue;
    byRegion.set(region, Math.max(byRegion.get(region) ?? 0, reachMpc.get(el.id)!));
  }
  return byRegion;
}

// Precomputed once so `enabled` costs one comparison per region rather than a
// table walk per frame. Conservative: it never drops a visible orbit.
const ORBIT_REACH_BY_REGION = orbitReachByRegion(SCENE_ANCHORS, ORBITAL_ELEMENTS, regionOfBody);

export const orbitTrailsLayer: ContentLayer = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx, _view) {
    if (state.gpu.orbitTrailRenderer === null) return false;
    // Toggle off AND the fade fully receded means truly hidden, so the whole
    // (hdr, NEAR0) pass drops — opacity 0 ⇒ no render.
    if (
      !state.settings.orbitTrails.enabled &&
      state.subsystems.fades.opacityOf({ kind: 'orbitTrails' }, ctx.nowMs) <= 0
    ) {
      return false;
    }
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Whole-layer sub-pixel cull: the per-orbit CULL_PX test in `draw`, bounded
    // once per region at the camera's NEAREST possible distance to any of that
    // region's orbit points. Keyed on the eye (`drawCamPos`), NOT `cam.distance`,
    // which measures to the orbit TARGET. Failing here lets the executor skip the
    // whole (hdr, NEAR0) step instead of packing zero records.
    const states = sceneBodyStates(state, ctx);
    for (const [region, reachMpc] of ORBIT_REACH_BY_REGION) {
      const nearestMpc = Math.max(
        regionRelativeDistanceMpc(ctx.drawCamPos, region, states) - reachMpc,
        0,
      );
      if (nearestMpc === 0) return true;
      const maxDiameterPx = apparentSizePx({
        diameterKpc: 2 * reachMpc * 1000,
        distanceMpc: nearestMpc,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      });
      if (maxDiameterPx >= CULL_PX) return true;
    }
    return false;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.orbitTrailRenderer;
    if (renderer === null) return;
    // Reading the shared snapshot — never re-deriving — is what welds each trail
    // to the exact instant its body is drawn at.
    const states = sceneBodyStates(state, ctx);
    const limit = ORBITAL_ELEMENTS.length;
    const camPos = ctx.drawCamPos;
    const viewportHeightPx = view.viewportPx[1];

    // Multiplied into every orbit's apparent-size alpha below, so a hide dissolves
    // the layer rather than popping it.
    const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'orbitTrails' });

    // One 34-float record per VISIBLE conic; byte offsets must mirror the
    // renderer's INSTANCE_ATTRIBUTES:
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32)
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48)
    //   floats 16..19 — mean anomaly + fade alpha + viewportPx.xy (loc5 at byte 64)
    //   floats 20..31 — clip basis Cc/Ac/Bc (loc6/7/8 at byte 80/96/112)
    //   floats 32..33 — the visible arc eStart/eSpan (loc9 at byte 128)
    let count = 0;
    for (let i = 0; i < limit; i++) {
      const elements = ORBITAL_ELEMENTS[i]!;
      // Re-derived at the frame instant, never baked. `keplerianEllipse` returns
      // FRESH vectors per call, so the in-place focus fold below cannot alias a
      // shared scratch across orbits.
      const propagated = propagateElements(elements, ctx.simDays);
      const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(propagated);
      // The snapshot seeds anchors (the Sun) alongside every element row, so a
      // heliocentric focus and a moving parent are the same lookup.
      const focus = states.get(elements.focusId)!.positionMpc;
      const centerMpc = centerOffsetMpc;
      centerMpc[0] += focus[0];
      centerMpc[1] += focus[1];
      centerMpc[2] += focus[2];

      const dx = centerMpc[0] - camPos[0];
      const dy = centerMpc[1] - camPos[1];
      const dz = centerMpc[2] - camPos[2];
      const distanceMpc = Math.hypot(dx, dy, dz);
      const semiMajorLenMpc = Math.hypot(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2]);
      const diameterPx = apparentSizePx({
        diameterKpc: 2 * semiMajorLenMpc * 1000,
        distanceMpc,
        viewportHeightPx,
        fovYRad: ctx.fovYRad,
      });
      if (diameterPx < CULL_PX) continue; // deep sub-pixel — do not render
      const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX)) * layerOpacity;

      const { ginv, clipBasis, arc } = composeOrbitConic(
        view.slab.vp,
        centerMpc,
        semiMajorMpc,
        semiMinorMpc,
        view.viewportPx,
        RENDER_ORIGIN_MPC,
      );
      if (arc[1] <= 0) continue; // whole orbit behind the camera — no geometry
      const base = count++ * INSTANCE_FLOATS;
      staging.set(ginv, base); // Ginv columns → floats 0..11
      staging[base + 12] = elements.color[0];
      staging[base + 13] = elements.color[1];
      staging[base + 14] = elements.color[2];
      staging[base + 15] = propagated.eccentricity;
      // Falloff anchor: the PROPAGATED mean anomaly, so the trail fades behind
      // where the body actually is at `t`.
      staging[base + 16] = states.get(elements.id)!.meanAnomalyRad;
      staging[base + 17] = alpha;
      staging[base + 18] = view.viewportPx[0]; // ribbon vertex stage's divisor
      staging[base + 19] = view.viewportPx[1];
      staging.set(clipBasis[0], base + 20); // clip basis Cc → floats 20..23
      staging.set(clipBasis[1], base + 24); // clip basis Ac → floats 24..27
      staging.set(clipBasis[2], base + 28); // clip basis Bc → floats 28..31
      staging[base + 32] = arc[0]; // visible arc eStart → float 32
      staging[base + 33] = arc[1]; // visible arc eSpan → float 33
    }
    if (count > 0) {
      renderer.draw(pass, staging, count, state.settings.debug.overlays['orbit-trail-impostor']);
    }
  },
};
