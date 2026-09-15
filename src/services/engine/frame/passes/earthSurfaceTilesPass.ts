/**
 * earthSurfaceTilesPass — the resident virtual-texture detail patches over the
 * base globe `earthPass` stamps, into the same `foreground:0` target.
 *
 * Its own row rather than a second draw inside `earthPass` for two reasons:
 * the patches get a render toggle and a GPU timing slot of their own, and the
 * "tiles after the globe" ordering the tile pipeline's depth compare relies on
 * becomes a named line in `FRAME_ORDER` instead of two adjacent statements in
 * one function. Both rows read the SAME `prepareBodySurfaceFrame` memo, so the
 * split costs no extra per-frame derivation.
 *
 * An empty cut or a not-yet-engaged atlas is the ordinary pre-residency
 * picture, not an error: `enabled` returns false and the base globe alone
 * covers the cap.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { bodyCameraDistanceMpc } from '../../../../utils/scene/bodyCameraDistanceMpc';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { prepareBodySurfaceFrame } from './earthPass';

export const earthSurfaceTilesPass: ContentPass = {
  name: 'earth-surface-tiles',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m' || view.slab.frame.bodyId !== 'earth') return false;
    if (state.gpu.earthSurfaceTileRenderer === null || state.gpu.earthRenderer === null) {
      return false;
    }
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const tiles = state.subsystems.surfaceTiles;
    if (tiles === undefined || tiles === null) return false;
    // The height atlas is as load-bearing as the albedo one: every vertex
    // position reads it, so a cut drawn without it would be a flat sphere at
    // best and garbage at worst.
    return (
      tiles.getLastCut().length > 0 &&
      tiles.getAtlasView() !== null &&
      tiles.getHeightAtlasView() !== null
    );
  },

  draw(pass, view, ctx, state) {
    const tileRenderer = state.gpu.earthSurfaceTileRenderer;
    const earthRenderer = state.gpu.earthRenderer;
    const earthTiles = state.subsystems.surfaceTiles;
    if (tileRenderer === null || earthRenderer === null) return;
    if (earthTiles === undefined || earthTiles === null) return;

    const prepared = prepareBodySurfaceFrame(state, ctx, view);
    if (prepared === null) return;
    const { bodyState: earthState, pose, radiusM } = prepared;

    const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
    // The same descent fade the deck itself uses, from the same range — the
    // shadow on a patch and the shadow on the base globe must dissolve
    // together or the two surfaces disagree mid-descent.
    const cloudFade = cloudDeckFade(
      bodyCameraDistanceMpc(earthState.positionMpc, ctx.drawCamPos),
      radiusM * SCALE_UNITS.M_TO_MPC,
    );

    tileRenderer.draw(pass, {
      tiles: earthTiles.getLastCut(),
      // The slab vp is already eye-relative by construction (body-m rows build
      // vp about the eye) — no rebase, unlike the old NEAR0 path.
      vp: view.vp,
      eyeRelBodyM: pose.eyeRelBodyM,
      radiusM,
      sunDirLocal: sun,
      roughnessBase: EARTH_SURFACE_PARAMS.roughnessBase,
      f0: EARTH_SURFACE_PARAMS.f0,
      sunIrradiance: EARTH_SURFACE_PARAMS.sunIrradiance,
      ambientLight: state.settings.earth.ambientLight,
      oceanRoughness: state.settings.earth.oceanRoughness,
      cloudShadowStrength: EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade,
      // Unit-sphere local radius of the SAME shell cloudShellPass draws, so the
      // cast shadow and the drawn deck agree by construction.
      cloudShellRadius: CLOUD_SHELL_PARAMS.radiusRatio,
      debugLodOverlay: state.settings.debug.overlays['earth-lod-overlay'],
      surfaceAtlasView: earthTiles.getAtlasView()!,
      heightAtlasView: earthTiles.getHeightAtlasView()!,
      materialView: earthRenderer.getMapView('material'),
      nightView: earthRenderer.getMapView('night'),
      cloudsView: earthRenderer.getMapView('clouds'),
    });
  },
};
