/**
 * orbitTrailsLayer — the accurate Keplerian orbit trails (Earth / Jupiter /
 * Moon) as additive screen-space conics in the depthless HDR accumulation.
 * The conic orbit-trail content-layer row (spec §6).
 *
 * ### Row shape: (hdr, NEAR0), additive — like star-points
 *
 * The orbits live at AU-to-lunar scale, far inside COSMO's 0.01 Mpc near
 * plane, so this row projects through NEAR0 (whose near/far track the
 * camera's orbit distance) while still accumulating into the HDR target so
 * the trails ride the same tone-map as everything else. The frame program's
 * existing `(hdr, NEAR0)` render step drives it — same group as
 * `starPointsLayer`, no new program step.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `planetsLayer` and the ring twin: the ellipse centres sit
 * AU-to-lunar distances (~1e-12 Mpc) from the render origin — tiny numbers
 * the VP's large translation column nearly cancels. `composeOrbitConic`
 * resolves that cancellation in double precision (it assembles and INVERTS
 * the full homography in f64) BEFORE narrowing to f32; feeding it the
 * already-narrowed `view.vp` would misplace a trail by far more than its
 * stroke width. This is a HARD INVARIANT — see `composeOrbitConic`'s module
 * header.
 *
 * ### The visibility layer — a hideable overlay
 *
 * The trails are a `VisibilityLayerKey` (`'orbitTrails'`): a clip can
 * `hide(['orbitTrails'])` / `show(['orbitTrails'])` exactly like `'filaments'`
 * or `'milkyWayDisk'`, and the UI toggle flows the same way. Intent lives in
 * `settings.orbitTrails.enabled`; the FADE_LAYERS manifest bridges that toggle to
 * a `{ kind: 'orbitTrails' }` fade controller so the whole layer DISSOLVES rather
 * than pops. `draw` reads that controller's opacity via `resolveLayerOpacity`
 * (same as `filamentsLayer`) and multiplies it into every orbit's per-orbit
 * apparent-size alpha, so the layer fade and the sub-pixel fade compose. Unlike
 * the demand-loaded overlays the conic table is a compile-time constant with no
 * asset slot, so the fade seeds from the toggle (register at 1 when on), not 0.
 *
 * ### When it draws
 *
 * `enabled` gates on the `orbitTrailRenderer` GPU handle (null in the
 * pre-bootstrap window), then the layer-visibility intent (toggled off AND the
 * fade fully receded ⇒ opacity-0, so the whole pass is dropped — the
 * opacity-0-means-no-render rule), then the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`) — beyond it every AU-to-lunar-scale trail
 * is deep sub-pixel, and gating with the NEAR0 siblings lets the executor
 * skip the whole `(hdr, NEAR0)` render step as empty. Within that gate, each
 * orbit is culled or faded PER-ORBIT by its apparent on-screen diameter: below
 * `CULL_PX` it is skipped from the draw entirely (deep sub-pixel aliasing, not
 * a legible path), and from there up to `FULL_PX` its brightness ramps in so it
 * does not pop. The degenerate case (camera on/inside an orbit) is handled
 * on the CPU: `composeOrbitConic` clips every orbit to its in-front-of-
 * camera arc in closed form, so the vertex stage samples only inside it and
 * needs no fallback; the fragment's off-stroke/horizon/non-finite discards
 * still guard against a filled blob at a non-finite `Ginv`.
 *
 * ### Conics re-derive at the frame instant
 *
 * The trails are NOT a baked table: each drawn frame re-derives every orbit at
 * `ctx.simDays` — `keplerianEllipse(propagateElements(elements, simDays))` gives
 * the focus-relative shape, and the absolute centre folds in the focus. A
 * heliocentric orbit's focus is the render origin (the Sun); a moon's focus is
 * its parent's LIVE position, read from the per-frame body snapshot
 * (`sceneBodyStates`) so a moon's trail rides its moving parent. The falloff
 * anchor is the body's PROPAGATED mean anomaly, also read from that one snapshot
 * — so trail and drawn body can never disagree. The derivation is cheap and only
 * runs inside the near-field gate, so it re-runs every frame rather than caching.
 * `ORBITAL_ELEMENTS` is a compile-time table, always present, so there is still
 * no data gate.
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

// Reused across frames — the engine hot path allocates nothing here. Sized
// for the live orbital-elements table (a compile-time constant, so this is a
// fixed size, not a cap — the renderer itself carries no upper bound, and
// growing the table just grows this array); each conic's 34-float record
// (three Ginv columns + colour/eccentricity + mean anomaly/fade/viewport +
// the three clip-basis vec4s + the visible-arc eStart/eSpan) is rewritten in
// place before the single packed draw. One slot per table row is enough
// since at most `ORBITAL_ELEMENTS.length` records are ever packed.
const staging = new Float32Array(ORBITAL_ELEMENTS.length * INSTANCE_FLOATS);

// A bound orbit's farthest point from its focus is its apoapsis a·(1+e); its
// focus in turn sits within its OWN focus's reach, so summing apoapsis along the
// focus chain bounds every point on the orbit for every t (worst case: every body
// in the chain at apoapsis, aligned outward). Sourced from the static
// ORBITAL_ELEMENTS a/e, NOT the conic CENTRES: once a clock animates the trails a
// moon centre rides its moving parent, so a centre-derived bound would go stale,
// whereas this element-derived envelope holds for every t.
function apoapsisMpc(elements: OrbitalElements): number {
  return elements.semiMajorMpc * (1 + elements.eccentricity);
}

/**
 * Each region's orbital reach FROM ITS OWN ANCHOR: the farthest any of that
 * region's orbit points can lie from the anchor, over ALL clock times — a
 * TIME-INVARIANT outer envelope. Regions with no orbits are absent from the map,
 * so nothing here ever resolves an anchor that carries no trails.
 *
 * Per region, not one scene-wide maximum, because a reach is only ever subtracted
 * from a camera distance measured against the SAME anchor. The two collapse into
 * one number only while every orbit hangs off the origin-anchored Sun; fold a
 * Galactic Centre orbit into a single maximum and the solar-system trails inherit
 * ITS envelope, so `enabled`'s cull stops firing for cameras nowhere near it.
 *
 * The tables are parameters, not this module's own imports, so the far-anchored
 * case is testable before such an orbit is seeded. `focusResolveOrder` is the
 * dependency order `deriveBodyStates` resolves anchors through, so a focus chain
 * of any depth is covered, not just satellite → planet.
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

// Precomputed once so `enabled` bounds every orbit's apparent size with one
// comparison per region instead of walking the table per frame. The bound is
// conservative (never drops a visible orbit) and only ever ≥ a centre-based
// value — the intended slight extra slack for moving centres.
const ORBIT_REACH_BY_REGION = orbitReachByRegion(SCENE_ANCHORS, ORBITAL_ELEMENTS, regionOfBody);

export const orbitTrailsLayer: ContentLayer = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate. `ORBITAL_ELEMENTS` is a compile-time table
    // (always present), so there is no data condition — and the apoapsis-derived
    // reaches below are TIME-INVARIANT, so this gate needs no per-frame
    // derivation even though the drawn conics do.
    if (state.gpu.orbitTrailRenderer === null) return false;
    // Layer-visibility intent, mirroring filamentsLayer: the toggle is the user's
    // intent, opacityOf > 0 is the visual tail. Render whenever EITHER holds so a
    // fade-out keeps drawing after a hide until opacity hits 0. When the toggle is
    // off AND the fade has fully receded the layer is truly hidden — drop the
    // whole (hdr, NEAR0) pass (opacity 0 ⇒ no render).
    if (
      !state.settings.orbitTrails.enabled &&
      state.subsystems.fades.opacityOf({ kind: 'orbitTrails' }, ctx.nowMs) <= 0
    ) {
      return false;
    }
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Whole-layer sub-pixel cull, the conservative bound of the per-orbit
    // CULL_PX loop in `draw`, asked once PER REGION: at the camera's NEAREST
    // possible distance to any of that region's orbit points (its distance from
    // the region's OWN anchor minus that region's reach — clamped to 0 when the
    // camera is at/inside the reach, which always stays enabled), even the
    // LARGEST of its orbits is an upper bound for all of them. Keyed on the eye
    // position (`drawCamPos`), NOT `cam.distance`, which measures to the orbit
    // TARGET. No region above CULL_PX means the draw loop would cull every conic
    // anyway — dropping the layer here lets the executor skip the whole
    // (hdr, NEAR0) step instead of packing zero records.
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
    // The per-frame body snapshot (memoized on `ctx.simDays`, shared with the
    // planet/textured-body layers): the source of every moon's parent centre and
    // every trail's mean-anomaly falloff anchor. Reading it — never re-deriving —
    // is what welds each trail to the exact instant its body is drawn at.
    const states = sceneBodyStates(state, ctx);
    const limit = ORBITAL_ELEMENTS.length;
    const camPos = ctx.drawCamPos;
    const viewportHeightPx = view.viewportPx[1];

    // Whole-layer opacity — the toggle/hide fade (× focus recession, neutral for
    // this near-field layer, × the clip-owned channel). Multiplied into every
    // orbit's apparent-size alpha below so the layer dissolves on hide rather than
    // popping. Mirrors filamentsLayer's `resolveLayerOpacity` call.
    const layerOpacity = resolveLayerOpacity(
      state.subsystems.fades,
      { kind: 'orbitTrails' },
      ctx.focusBlend,
      ctx.nowMs,
      state.subsystems.clipPlayer,
    );

    // Pack one 34-float instance record per VISIBLE conic (byte offsets mirror
    // the renderer's INSTANCE_ATTRIBUTES):
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32),
    //                    composed from the slab's f64 vp (the hard invariant
    //                    in the module header),
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48),
    //   floats 16..19 — mean anomaly + fade alpha + viewportPx.xy (loc5 at byte 64,
    //                    the ribbon vertex stage's divisor — see composeOrbitConic),
    //   floats 20..31 — clip basis Cc/Ac/Bc (loc6/7/8 at byte 80/96/112),
    //                    the ribbon vertex stage's screen-space bound,
    //   floats 32..33 — the visible arc eStart/eSpan (loc9 at byte 128), the
    //                    CPU closed-form clip composeOrbitConic returns.
    // Orbits below the apparent-size cull threshold are skipped entirely (not
    // drawn); the rest fade in via the alpha the fragment multiplies through.
    // The fragment's Newton horizon rejection is what keeps a near-edge-on
    // orbit a thin line, not a blob.
    //
    // Every visible record packs front-to-back into `staging` behind one
    // counter — each orbit is independently clipped to its own visible arc
    // (composeOrbitConic), so there is no second partition to keep separate.
    let count = 0;
    for (let i = 0; i < limit; i++) {
      const elements = ORBITAL_ELEMENTS[i]!;
      // Re-derive the conic AT the frame instant: propagate the elements to
      // `ctx.simDays`, then image the unit circle. `keplerianEllipse` returns
      // three FRESH focus-relative vectors per call — the same per-conic distinct
      // arrays the static table used to hold, so composeOrbitConic still receives
      // a distinct centre per orbit (nothing aliases a shared scratch).
      const propagated = propagateElements(elements, ctx.simDays);
      const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(propagated);
      // Fold the focus into an absolute-world centre, in place on the fresh
      // offset array (no extra allocation). The snapshot seeds anchors (the
      // Sun) alongside every element row, so every focus — heliocentric or a
      // moving parent — is the same uniform lookup; no per-orbit special case.
      const focus = states.get(elements.focusId)!.positionMpc;
      const centerMpc = centerOffsetMpc;
      centerMpc[0] += focus[0];
      centerMpc[1] += focus[1];
      centerMpc[2] += focus[2];

      // Apparent on-screen diameter: 2·|semiMajor| across, at the camera's
      // distance to the ellipse centre.
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
      // Per-orbit apparent-size fade × the whole-layer opacity (hide/show fade).
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
      // Falloff anchor: the body's PROPAGATED mean anomaly from the snapshot —
      // where the body actually is at `t`, so the trail fades behind IT.
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
