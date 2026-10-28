/**
 * surfaceTilesPass — the resident virtual-texture detail patches over the
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
 * covers the cap. The engaged body's `SURFACE_TILE_REGISTRY` row is the
 * predicate and picks the shading; the effect maps come from `earthRenderer`,
 * the only body whose maps exist today.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { SurfaceEffect } from '../../../@types/data/SurfaceEffect';
import type { SurfaceEffectInputs } from '../@types/SurfaceEffectInputs';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { BODY_AMBIENT_LIGHT } from '../../../data/bodies/bodyAmbientLight';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../present/cloudShellParams';
import { bodyCameraDistanceMpc } from '../present/bodyCameraDistanceMpc';
import { cloudDeckFade } from '../present/cloudDeckFade';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { isTexturedBodyKey } from '../present/isTexturedBodyKey';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { prepareBodySurfaceFrame } from '../present/prepareBodySurfaceFrame';
import { surfaceTileSpecOf } from '../../../utils/surfaceTiles/surfaceTileSpecOf';

export function surfaceTilesPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'surface-tiles',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const hostId = view.slab.frame.hostId;
      const spec = surfaceTileSpecOf(hostId);
      if (spec === null) return false;
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      const tiles = state.subsystems.surfaceTiles;
      if (tiles === undefined || tiles === null) return false;
      // The height atlas is as load-bearing as the albedo one: every vertex
      // position reads it, so a cut drawn without it would be a flat sphere at
      // best and garbage at worst.
      return (
        tiles.plan.cut.length > 0 &&
        tiles.stream.getAtlasView() !== null &&
        tiles.stream.getHeightAtlasView() !== null
      );
    },

    draw(pass, view, ctx, state) {
      const surfaceTiles = state.subsystems.surfaceTiles;
      if (view.slab.frame.kind !== 'body-m') return;
      if (surfaceTiles === undefined || surfaceTiles === null) return;
      const hostId = view.slab.frame.hostId;
      const spec = surfaceTileSpecOf(hostId);
      if (spec === null) return;
      const earthRenderer = runtime.earthRenderer;

      const prepared = prepareBodySurfaceFrame(state, ctx, view);
      if (prepared === null) return;
      const { bodyState, pose, radiusM } = prepared;

      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      const has = (effect: SurfaceEffect) => spec.effects.includes(effect);
      const effectInputs: SurfaceEffectInputs = {
        ...(has('materialMap') && {
          materialMap: {
            view: earthRenderer.getMapView('material'),
            oceanRoughness: state.settings.earth.oceanRoughness,
          },
        }),
        ...(has('nightLights') && { nightLights: { view: earthRenderer.getMapView('night') } }),
        ...(has('cloudShadows') && {
          cloudShadows: {
            view: earthRenderer.getMapView('clouds'),
            // The same descent fade the deck itself uses, from the same
            // range — the shadow on a patch and on the base globe dissolve
            // together.
            strength:
              EARTH_SURFACE_PARAMS.cloudShadowStrength *
              cloudDeckFade(
                bodyCameraDistanceMpc(bodyState.positionMpc, ctx.drawCamPos),
                radiusM * SCALE_UNITS.M_TO_MPC,
              ),
            // Unit-sphere radius of the SAME shell cloudShellPass draws, so
            // the cast shadow and the drawn deck agree by construction.
            shellRadius: CLOUD_SHELL_PARAMS.radiusRatio,
          },
        }),
      };

      runtime.surfaceTileRenderer.draw(pass, {
        tiles: surfaceTiles.plan.cut,
        // The slab vp is already eye-relative by construction (body-m rows build
        // vp about the eye) — no rebase, unlike the old NEAR0 path.
        vp: view.vp,
        eyeRelBodyM: pose.eyeRelBodyM,
        radiusM,
        sunDirLocal: sun,
        effects: spec.effects,
        effectInputs,
        shading: spec.shading,
        // Earth's floor is its live slider; any other body matches its textured globe.
        ambientLight: isTexturedBodyKey(view.slab.frame.hostId as BodyTextureId)
          ? BODY_AMBIENT_LIGHT
          : state.settings.earth.ambientLight,
        debugLodOverlay: state.settings.debug.overlays['surface-lod-overlay'],
        noDisplacement: state.settings.debug.overlays['terrain-no-displacement'],
        noSkirts: state.settings.debug.overlays['terrain-no-skirts'],
        surfaceAtlasView: surfaceTiles.stream.getAtlasView()!,
        heightAtlasView: surfaceTiles.stream.getHeightAtlasView()!,
      });
    },
  };
}
