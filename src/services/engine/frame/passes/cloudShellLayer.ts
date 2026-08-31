/**
 * cloudShellLayer — Earth's translucent cloud deck as a `'body'`-slab content
 * row drawing into the depth-bearing `foreground:0` target (spec §8), a thin
 * shell just above the opaque surface `earthLayer` stamps.
 *
 * ### What it draws — the translucent deck over the opaque globe
 *
 * The frame program expands a `'body'` layer into one render step per body-m
 * slab row (Task 7); `enabled`/`draw` are called once per body-m row and gate
 * on `view.slab.frame.bodyId` — `cloudShellDraw` widens that gate to "this
 * row's body has a cloud-shell row", which today still means Earth alone
 * (`CLOUD_SHELL_PARAMS.radiusRatio` is one shared constant, not a per-body
 * table — the lean choice while Earth is the only textured cloud deck). The
 * seeded `bodies.earth` record is composed as a unit sphere scaled to
 * `earth.radiusM × CLOUD_SHELL_PARAMS.radiusRatio` (a hair above the surface)
 * in the body's own eye-relative frame, with the orientation resolved this
 * frame from the `BodyState` snapshot. The shared `cloudShellRenderer`
 * textures that sphere with Earth's equirectangular cloud map (RGB colour +
 * `.a` coverage) and dims it by the same body-local sun-relative Lambert term
 * the surface uses, so the deck goes dark on the night side.
 * `CLOUD_SHELL_PARAMS.opacity` is the coverage-to-alpha multiplier folded
 * into the shell's straight-alpha output.
 *
 * ### Why it draws AFTER earth, OVER not opaque
 *
 * The shell is the second translucent member of the `(foreground:0, 'body')`
 * render group (the ring is the other). It is registered immediately AFTER
 * `earthLayer` so it draws once the opaque globe has stamped its depth: the
 * shell pipeline depth-TESTS against the surface (`depthCompare: 'greater'`,
 * the body-m slab's reversed-Z convention — clear `0.0`, greater-z-wins, so a
 * nearer surface stamps a LARGER depth) so the far hemisphere is correctly
 * occluded, but writes NO depth (`depthWriteEnabled: false`) and blends
 * straight-alpha OVER. `atmosphereShellLayer` lands AFTER this row (drawn
 * last), so the deck sits under the atmosphere but over the surface.
 *
 * ### The f64 seam — `ctx.bodyPose`, not a re-derived camera basis
 *
 * Same seam as `earthLayer` and every body-slab layer: this row's `pose =
 * ctx.bodyPose('earth')` is the SAME closure `deriveSlabs` built this row's
 * `view.slab.vp` from, so `composeBodySlabMvp` composes against the eye-
 * relative metre offset that vp already expects — no rotation term, no world
 * translation. See `composeBodySlabMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `cloudShellRenderer` handle (null pre-bootstrap),
 * this row being Earth's own body-m row, the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`) — the same near-field gate `earthLayer`
 * applies, so the shell appears exactly when the surface does — AND the
 * clouds slot being RESIDENT and `cloudDeckFade` (see its header) being above
 * 0: a row that would add nothing to the frame — no map yet, or fully faded
 * on approach to the surface tiles — leaves the pass plan rather than draw a
 * fully transparent sphere. Both `enabled` and `draw` read ONE
 * `cloudShellDraw` derivation, so the gate and the loop can never disagree.
 *
 * The shell is non-pickable (spec §8.3): a translucent overlay has no
 * clickable silhouette of its own — clicking Earth hits the opaque surface
 * `earthLayer` stamps into the pick pass. So this row declares no `drawPick`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EarthBody } from '../../../../@types/scene/EarthBody';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { bodyTextureSlotKey } from '../../../../utils/scene/bodyTextureSlotKey';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packCloudShellUniforms } from '../../../../utils/gpu/packCloudShellUniforms';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { sceneBodyStates } from '../sceneBodyStates';

/** The Earth body plus its resolved descent-fade multiplier for this frame. */
type CloudShellDraw = { readonly earth: EarthBody; readonly deckFade: number };

/**
 * The Earth record + descent-fade multiplier to draw the cloud shell with this
 * frame for `bodyId`, or `null` if the shell should not render — `bodyId` is
 * not Earth (today's only cloud-shell body), the clouds map has not
 * committed, the body is beyond the near-field distance gate, it resolves to
 * sub-pixel, or the descent fade has reached 0. ONE derivation feeds both
 * `enabled` and `draw`, so the gate and the loop can never disagree about
 * whether the shell renders. Mirrors `earthLayer`'s near-field gate plus the
 * ring's residency gate.
 */
function cloudShellDraw(
  state: EngineState,
  ctx: ReadyFrameContext,
  bodyId: BodyId,
): CloudShellDraw | null {
  const earth = state.data.bodies.earth;
  if (earth === null || earth.id !== bodyId) return null;
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
  const bodyRadiusMpc = earth.radiusM * SCALE_UNITS.M_TO_MPC;
  const deckFade = cloudDeckFade(distanceMpc, bodyRadiusMpc);
  if (deckFade <= 0) return null;
  // Sub-pixel cull on Earth's diameter (the shell is a hair larger, so the
  // surface gate governs both). apparentSizePx returns 0 for a zero
  // camera-to-centre distance (camera inside the body), which reads as
  // resolved here since deckFade already handled that case above.
  if (distanceMpc === 0) return { earth, deckFade };
  const diameterPx = apparentSizePx({
    diameterKpc: (2 * earth.radiusM * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX ? { earth, deckFade } : null;
}

export const cloudShellLayer: ContentLayer = {
  name: 'cloud-shell',
  slab: 'body',
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the body inputs.
    if (state.gpu.cloudShellRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw nothing (no resident map / sub-pixel) must leave the
    // pass plan: mirror draw's branch with the SAME derivation.
    return cloudShellDraw(state, ctx, view.slab.frame.bodyId) !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.cloudShellRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const drawInputs = cloudShellDraw(state, ctx, view.slab.frame.bodyId);
    if (drawInputs === null) return;
    const { earth, deckFade } = drawInputs;
    // The SAME pose-provider closure `deriveSlabs` was fed to build this row's
    // `view.slab.vp` — reading it here instead of re-deriving the pose is what
    // keeps this layer's eyeRelBodyM from ever drifting off that basis. The
    // row's own `bodyId` (not `earth.id`, a plain `string`) is what
    // `BodyPoseProvider` accepts.
    const pose = ctx.bodyPose(view.slab.frame.bodyId);
    if (pose === null) return;

    // Live position + orientation from the per-frame snapshot (keyed by id) — not
    // the baked record fields; radius stays authored identity on the record.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;

    // Scale the unit sphere to the shell radius — just above the surface — in
    // metres, the body-m slab frame's own unit (earth.radiusM is already metres,
    // so no Mpc conversion crosses this seam).
    const shellRadiusM = earth.radiusM * CLOUD_SHELL_PARAMS.radiusRatio;
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, shellRadiusM);
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
        // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
        narrowMat4(mvp),
        sun,
        CLOUD_SHELL_PARAMS.opacity * deckFade,
        EARTH_SURFACE_PARAMS.sunIrradiance,
        state.settings.earth.ambientLight,
      ),
    );
  },
};
