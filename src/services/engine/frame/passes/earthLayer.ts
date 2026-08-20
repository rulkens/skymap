/**
 * earthLayer — the true-scale, Blue-Marble-textured Earth as a content-layer
 * row drawing into the depth-bearing `foreground:0` target.
 *
 * Draws the single seeded `bodies.earth` record as a unit sphere scaled to its
 * radius and translated to its position in the `RENDER_ORIGIN_MPC`-relative
 * frame, packing the 144-byte `EarthSurfaceUniforms` record (MVP + sun
 * direction + camera, all body-local, plus the PBR params including the
 * user-tunable `settings.earth.ambientLight` / `oceanRoughness` overrides).
 * `earthRenderer.draw` writes it into a single non-dynamic uniform buffer, so
 * this row must draw Earth AT MOST once per frame (see that renderer's header
 * for the `writeBuffer`-vs-`submit` race a second draw would trigger).
 *
 * Reads the slab's f64 `view.slab.vp`, not the f32-narrowed `view.vp`, like the
 * other near-field sphere layers: Earth sits ~4.85e-12 Mpc from the render
 * origin, a cancellation `composeBodyMvp` must resolve in double precision
 * BEFORE narrowing to f32, or Earth mis-places by more than its own radius.
 *
 * `enabled` gates on the `earthRenderer` GPU handle, the seeded `bodies.earth`
 * record, the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`),
 * and a sub-pixel cull (`SUB_PIXEL_BODY_CULL_PX`) — Earth spends most of the
 * descent under a pixel across, where the star-point backdrop already shows
 * it. `draw` re-checks both handles so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { packEarthSurfaceUniforms } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';
import { sceneBodyStates } from '../sceneBodyStates';

/**
 * Camera-to-Earth-centre distance in Mpc, from the live per-frame snapshot
 * position — NOT `ctx.cam.distance` (the orbit distance-to-FOCUS, which
 * coincides with this only while Earth is the orbit pivot). `enabled`'s
 * sub-pixel cull and `draw`'s cloud-shadow descent fade both key off this same
 * quantity; factoring it out here means they read it once instead of
 * potentially drifting onto two slightly different distances.
 */
function earthCameraDistanceMpc(earthPositionMpc: Vec3, ctx: ReadyFrameContext): number {
  const dx = earthPositionMpc[0] - ctx.drawCamPos[0];
  const dy = earthPositionMpc[1] - ctx.drawCamPos[1];
  const dz = earthPositionMpc[2] - ctx.drawCamPos[2];
  return Math.hypot(dx, dy, dz);
}

/**
 * One Earth per-frame derivation, shared by `draw`, `drawPick`, and
 * `runFrame`'s tile planner — the three sites that each used to
 * independently look up `earthState` and (`draw`/the planner) recompute the
 * same body-local MVP + camera. Memoised per `ctx` (mirrors `prepareStarCut`
 * in `starCatalogLayer.ts`), so whichever call site reaches it first in a
 * frame does the work and the rest read the cache. `view` must be
 * `slabViewOf(ctx, NEAR0)` for the same `ctx` this is keyed on — a documented
 * precondition, not enforced by types, true at both real call sites.
 */
export type PreparedEarthFrame = {
  readonly earthState: BodyState;
  readonly radiusMpc: number;
  readonly mvpLocal: Float32Array;
  readonly camLocal: Vec3;
};

const preparedByCtx = new WeakMap<ReadyFrameContext, PreparedEarthFrame | null>();

export function prepareEarthFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
): PreparedEarthFrame | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeEarthFrame(state, ctx, view);
  preparedByCtx.set(ctx, result);
  return result;
}

function computeEarthFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
): PreparedEarthFrame | null {
  const earth = state.data.bodies.earth;
  if (earth === null) return null;

  const earthState = sceneBodyStates(state, ctx).get(earth.id)!;
  const radiusMpc = earth.radiusKm * SCALE_UNITS.KM_TO_MPC;
  // See the module header's "f64 seam" note for why view.slab.vp, not view.vp.
  const mvpLocal = composeBodyMvp(
    view.slab.vp,
    earthState.positionMpc,
    RENDER_ORIGIN_MPC,
    radiusMpc,
    earthState.orientation,
  );
  const camLocal = camPosLocal(
    view.camPos,
    earthState.positionMpc,
    radiusMpc,
    earthState.orientation,
  );
  return { earthState, radiusMpc, mvpLocal, camLocal };
}

export const earthLayer: ContentLayer = {
  name: 'earth',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    if (state.gpu.earthRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const earth = state.data.bodies.earth;
    if (earth === null) return false;
    // Live position from the per-frame snapshot, not the baked record field.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;
    // Sub-pixel cull (see SUB_PIXEL_BODY_CULL_PX): Earth is the layer's only
    // body, so this whole-layer gate is exact, unlike planetsLayer's per-body
    // cull. Zero distance means the camera is INSIDE the body — apparentSizePx
    // defensively returns 0 there, which would read as sub-pixel, so treat it
    // as resolved.
    const distanceMpc = earthCameraDistanceMpc(earthState.positionMpc, ctx);
    if (distanceMpc === 0) return true;
    const diameterPx = apparentSizePx({
      diameterKpc: (2 * earth.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.earthRenderer;
    if (renderer === null) return;

    const prepared = prepareEarthFrame(state, ctx, view);
    if (prepared === null) return;
    const { earthState, radiusMpc, mvpLocal: mvp, camLocal } = prepared;

    // Sun direction rotated into Earth's local frame (orientation carries the
    // axial tilt), so the fragment's lighting stays a plain dot product.
    const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
    // The window the fragment addresses tiles through, read from the tile
    // subsystem rather than this frame's plan: the subsystem reports the
    // window the page-table TEXTURE was actually built against, which lags a
    // plan update until the texture re-derives. Null (the all-zero identity)
    // before the first upload.
    const tileWindow = state.subsystems.earthTiles?.getUploadedWindow() ?? null;
    // Same descent fade the cloud shell itself uses, from the same
    // camera-to-Earth-centre distance enabled's sub-pixel cull reads — the deck
    // and the shadow it casts must dissolve together.
    //
    // KNOWN OMISSION: this fade does not reach the night-side city-lights
    // dimming (nightLights reads cloudAlphaHere with no strength scalar).
    // Fixing that needs one more uniform field; `debugLodOverlay`'s row left two
    // pad slots free (`packEarthSurfaceUniforms.ts`), so it no longer forces a
    // fresh 16-byte row — still deferred rather than paid for a night-side-only
    // artifact.
    const cloudFade = cloudDeckFade(earthCameraDistanceMpc(earthState.positionMpc, ctx), radiusMpc);
    renderer.draw(
      pass,
      packEarthSurfaceUniforms(
        mvp,
        sun,
        camLocal,
        EARTH_SURFACE_PARAMS.roughnessBase,
        EARTH_SURFACE_PARAMS.f0,
        EARTH_SURFACE_PARAMS.sunIrradiance,
        EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade,
        // Unit-sphere local radius of the SAME shell cloudShellLayer draws, so
        // the cast shadow and the drawn deck agree by construction.
        CLOUD_SHELL_PARAMS.radiusRatio,
        // Live user settings, not the WESL consts (seeded from
        // EARTH_SURFACE_PARAMS so the defaults match).
        state.settings.earth.ambientLight,
        state.settings.earth.oceanRoughness,
        // Page-table window (zWin, winX0, winY0). All-zero is the identity: no
        // tile named anywhere, base texture shown, window never consulted.
        tileWindow?.zWin ?? 0,
        tileWindow?.winX0 ?? 0,
        tileWindow?.winY0 ?? 0,
        // DebugPanel's Earth LOD overlay toggle — read live each frame from
        // the DEBUG_OVERLAY_ROWS-derived record, same as the other overlays.
        state.settings.debug.overlays['earth-lod-overlay'],
      ),
    );
  },

  // Stamps Earth's packed identity into the NEAR0 r32uint pick pass. Earth is
  // the sole body of Source.Earth, so its seed index is the constant 0; the
  // packed id's PICK_SENTINEL_OFFSET keeps a real hit distinct from the
  // cleared-to-zero no-hit texel.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const prepared = prepareEarthFrame(state, ctx, view);
    if (prepared === null) return;
    const { earthState, radiusMpc } = prepared;

    // Floor the pick radius (drawFlooredSpherePick) so a far-edge Earth
    // projecting to a couple of pixels stays clickable. Deliberately NOT
    // `prepared.mvpLocal`/`camLocal` — those are composed against the true
    // equatorial radius; drawFlooredSpherePick composes its own MVP/camPos
    // internally against the floored pick radius.
    drawFlooredSpherePick(pickRenderer, pass, {
      vp: view.slab.vp,
      positionMpc: earthState.positionMpc,
      radiusMpc,
      camPosMpc: view.camPos,
      drawPxPerRad: ctx.drawPxPerRad,
      orientation: earthState.orientation,
      packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
    });
  },
};
