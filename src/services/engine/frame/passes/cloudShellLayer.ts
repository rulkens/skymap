/**
 * cloudShellLayer — Earth's translucent cloud deck as a content-layer row drawing
 * into the depth-bearing `foreground:0` target (spec §8), a thin shell just above
 * the opaque surface `earthLayer` stamps.
 *
 * ### What it draws — the translucent deck over the opaque globe
 *
 * The single seeded `bodies.earth` record, composed as a unit sphere scaled to
 * `earth.radiusKm × CLOUD_SHELL_PARAMS.radiusRatio` (a hair above the surface) and
 * placed in the body's `RENDER_ORIGIN_MPC`-relative frame with the orientation
 * resolved this frame from the `BodyState` snapshot. The shared `cloudShellRenderer` textures that sphere with Earth's
 * equirectangular cloud map (RGB colour + `.a` coverage) and dims it by the same
 * body-local sun-relative Lambert term the surface uses, so the deck goes dark on
 * the night side. `CLOUD_SHELL_PARAMS.opacity` is the coverage-to-alpha
 * multiplier folded into the shell's straight-alpha output.
 *
 * ### Why it draws AFTER earth, OVER not opaque
 *
 * The shell is the second translucent member of the `(foreground:0, NEAR0)` render
 * group (the ring is the other). It is registered immediately AFTER `earthLayer`
 * so it draws once the opaque globe has stamped its depth: the shell pipeline
 * depth-TESTS against the surface (`depthCompare: 'greater'`, the NEAR0 slab's
 * reversed-Z convention — clear `0.0`, greater-z-wins, so a nearer surface stamps
 * a LARGER depth) so the far hemisphere is correctly occluded, but writes NO depth
 * (`depthWriteEnabled: false`) and
 * blends straight-alpha OVER. That is why this row carries `blend: 'over'` where
 * the opaque body siblings carry `'opaque'`, and the shell pipeline bakes exactly
 * that profile. Plan E's `atmosphereShellLayer` lands AFTER this row (drawn last),
 * so the deck sits under the atmosphere but over the surface.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` and the other sphere-body layers: Earth sits ~1 AU
 * from the render origin, a tiny Mpc number the VP's large translation nearly
 * cancels. `composeBodyMvp` resolves that cancellation in double precision before
 * narrowing to f32; feeding it the already-narrowed `view.vp` would misplace the
 * shell by more than its own thickness. See `composeBodyMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `cloudShellRenderer` handle (null pre-bootstrap), the
 * seeded `bodies.earth` record, the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`) + sub-pixel cull (`SUB_PIXEL_BODY_CULL_PX`) — the
 * same near-field gate `earthLayer` applies, so the shell appears exactly when the
 * surface does — AND the clouds slot being RESIDENT and `cloudDeckFade` (see its
 * header) being above 0: a row that would add nothing to the frame — no map yet,
 * or fully faded on approach to the surface tiles — leaves the pass plan rather
 * than draw a fully transparent sphere. Both `enabled` and `draw` read ONE
 * `cloudShellDraw` derivation, so the gate and the loop can never disagree.
 *
 * The shell is non-pickable (spec §8.3): a translucent overlay has no clickable
 * silhouette of its own — clicking Earth hits the opaque surface `earthLayer`
 * stamps into the pick pass. So this row declares no `drawPick`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EarthBody } from '../../../../@types/scene/EarthBody';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { bodyTextureSlotKey } from '../../../../utils/scene/bodyTextureSlotKey';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { packCloudShellUniforms } from '../../../../utils/gpu/packCloudShellUniforms';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { sceneBodyStates } from '../sceneBodyStates';

/** The Earth body plus its resolved descent-fade multiplier for this frame. */
type CloudShellDraw = { readonly earth: EarthBody; readonly deckFade: number };

/**
 * The Earth record + descent-fade multiplier to draw the cloud shell with this
 * frame, or `null` if the shell should not render — the clouds map has not
 * committed, the body is beyond the near-field distance gate, it resolves to
 * sub-pixel, or the descent fade has reached 0. ONE derivation feeds both
 * `enabled` and `draw`, so the gate and the loop can never disagree about
 * whether the shell renders. Mirrors `earthLayer`'s near-field gate plus the
 * ring's residency gate.
 */
function cloudShellDraw(state: EngineState, ctx: ReadyFrameContext): CloudShellDraw | null {
  const earth = state.data.bodies.earth;
  if (earth === null) return null;
  // Resident iff the clouds slot holds a committed bitmap; otherwise the shell
  // would draw a fully transparent sphere (placeholder alpha 0) — drop the row.
  if (state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth', 'clouds'))?.current() == null)
    return null;
  // Live position from the per-frame snapshot (keyed by id) — not the baked
  // record field; the record still gates presence + residency and carries the
  // authored radius.
  const earthPos = sceneBodyStates(state, ctx).get(earth.id)!.positionMpc;
  const dx = earthPos[0] - ctx.drawCamPos[0];
  const dy = earthPos[1] - ctx.drawCamPos[1];
  const dz = earthPos[2] - ctx.drawCamPos[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  // Checked before the sub-pixel cull so it also covers that cull's
  // distanceMpc === 0 degenerate case: a camera at the body's centre is deep
  // inside the fade-out band already.
  const bodyRadiusMpc = earth.radiusKm * SCALE_UNITS.KM_TO_MPC;
  const deckFade = cloudDeckFade(distanceMpc, bodyRadiusMpc);
  if (deckFade <= 0) return null;
  // Sub-pixel cull on Earth's diameter (the shell is a hair larger, so the
  // surface gate governs both). apparentSizePx returns 0 for a zero
  // camera-to-centre distance (camera inside the body), which reads as
  // resolved here since deckFade already handled that case above.
  if (distanceMpc === 0) return { earth, deckFade };
  const diameterPx = apparentSizePx({
    diameterKpc: (2 * earth.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX ? { earth, deckFade } : null;
}

export const cloudShellLayer: ContentLayer = {
  name: 'cloud-shell',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx) {
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the body inputs.
    if (state.gpu.cloudShellRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw nothing (no resident map / sub-pixel) must leave the
    // pass plan: mirror draw's branch with the SAME derivation.
    return cloudShellDraw(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.cloudShellRenderer;
    if (renderer === null) return;
    const drawInputs = cloudShellDraw(state, ctx);
    if (drawInputs === null) return;
    const { earth, deckFade } = drawInputs;

    // Live position + orientation from the per-frame snapshot (keyed by id) — not
    // the baked record fields; radius stays authored identity on the record.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;

    // Scale the unit sphere to the shell radius — just above the surface — from
    // the slab's f64 vp (the f64 seam), folding in Earth's resolved orientation so
    // the cloud map's equirectangular texels co-register with the surface.
    const shellRadiusMpc = earth.radiusKm * SCALE_UNITS.KM_TO_MPC * CLOUD_SHELL_PARAMS.radiusRatio;
    const mvp = composeBodyMvp(
      view.slab.vp,
      earthState.positionMpc,
      RENDER_ORIGIN_MPC,
      shellRadiusMpc,
      earthState.orientation,
    );
    // Sun rotated into Earth's local frame (its resolved orientation carries the
    // axial tilt), so the fragment's Lambert dim on the night side stays co-framed
    // with the surface.
    const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
    // Scale the shell's direct (sun-lit) term by the SAME irradiance the surface
    // uses (single source of truth), so clouds — the brightest real feature — are
    // not dimmer than the ground beneath them. The ambient floor is likewise the
    // SAME live user setting the surface reads (`settings.earth.ambientLight`), so
    // the deck's night side dims in lockstep with the ground. `deckFade` folds
    // the descent fade into the opacity multiplier; it is always > 0 here.
    renderer.draw(
      pass,
      packCloudShellUniforms(
        mvp,
        sun,
        CLOUD_SHELL_PARAMS.opacity * deckFade,
        EARTH_SURFACE_PARAMS.sunIrradiance,
        state.settings.earth.ambientLight,
      ),
    );
  },
};
