/**
 * earthLayer — Earth's `'body'`-slab content row: the base globe, then the
 * resident surface-tile detail patches over it, drawn into `foreground:0`.
 *
 * Earth's `body-m` slab row IS the visibility gate (Task 1 culls it at
 * sub-pixel), so `enabled` mainly checks `view.slab.frame.bodyId === 'earth'`;
 * the foreground-distance check below is the one gate this layer still owns,
 * shared with `planetsLayer`.
 *
 * `earthRenderer.draw` writes ONE non-dynamic uniform buffer, so this row
 * draws the base globe AT MOST once per frame (see that renderer's header for
 * the `writeBuffer`-vs-`submit` race a second draw would trigger). The detail
 * tiles draw AFTER it (gated on a non-empty last cut + a live atlas view — an
 * empty cut is a legitimate "nothing resident yet" frame, not a bug), so the
 * tile pipeline's `nearer-or-equal` depth compare resolves ties in its
 * favour. Past that gate the base globe's alpha dissolves through
 * `baseGlobeFadeAlpha` so the tile mesh — which fully covers the cap by
 * then — stops fighting the base globe's depth for it; outside the gate
 * alpha is pinned to 1, the failure floor for every disengaged case.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { SceneBody } from '../../../../@types/scene/SceneBody';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyRelativePose } from '../../../../@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packEarthSurfaceUniforms } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { baseGlobeFadeAlpha } from '../../../../utils/scene/baseGlobeFadeAlpha';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { bodySlabFlooredPick } from '../../helpers/bodySlabFlooredPick';
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
 * The registry record for `bodyId`, searched across every store the body-slab
 * layers can seed a row from. Mirrors `sceneBodyStates`' own null-safety
 * (missing ⇒ `null`, never a crash) rather than assuming Earth.
 */
function sceneBodyForId(state: EngineState, bodyId: BodyId): SceneBody | null {
  const { earth, planets, stars } = state.data.bodies;
  if (earth !== null && earth.id === bodyId) return earth;
  const planet = planets.find((p) => p.id === bodyId);
  if (planet !== undefined) return planet;
  return stars.find((s) => s.id === bodyId) ?? null;
}

/**
 * One body-slab-row derivation, shared by `draw`, `drawPick`, and
 * `runFrame`'s tile planner — the three sites that each used to
 * independently look up the body's state and recompute the same body-local
 * MVP + camera. Memoised per `(ctx, bodyId)` (mirrors `prepareStarCut` in
 * `starCatalogLayer.ts`), so whichever call site reaches it first in a frame
 * does the work and the rest read the cache — keyed on `bodyId`, not just
 * `ctx`, because a single ctx now serves every body-slab row and a `ctx`-only
 * memo would return Earth's frame for any other body sharing the same frame.
 */
export type PreparedBodySurfaceFrame = {
  readonly body: SceneBody;
  readonly bodyState: BodyState;
  readonly pose: BodyRelativePose;
  readonly radiusM: number;
  /** composeBodySlabMvp result — RAW f64; the tile planner needs it un-narrowed. */
  readonly mvpLocal: Float64Array;
  /** bodySlabCamLocal result — dimensionless body-radius units. */
  readonly camLocal: Vec3;
};

const preparedByCtx = new WeakMap<
  ReadyFrameContext,
  Map<BodyId, PreparedBodySurfaceFrame | null>
>();

// The tile mesh cache's LRU stamp — an integer index rather than `ctx.nowMs`
// so a stepped/paused clock (tests, a recorder) can't collapse two frames'
// stamps onto the same value. Advanced once per real tile draw, not memoised
// alongside `PreparedBodySurfaceFrame` (unlike the old per-ctx frame field):
// it has nothing to do with the pose derivation and would otherwise stay
// stale across a (ctx, bodyId) cache hit.
let earthFrameCounter = 0;

export function prepareBodySurfaceFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
): PreparedBodySurfaceFrame | null {
  if (view.slab.frame.kind !== 'body-m') return null;
  const bodyId = view.slab.frame.bodyId;

  let byBody = preparedByCtx.get(ctx);
  if (byBody === undefined) {
    byBody = new Map();
    preparedByCtx.set(ctx, byBody);
  }
  if (byBody.has(bodyId)) return byBody.get(bodyId)!;

  const result = computeBodySurfaceFrame(state, ctx, view, bodyId);
  byBody.set(bodyId, result);
  return result;
}

function computeBodySurfaceFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
  bodyId: BodyId,
): PreparedBodySurfaceFrame | null {
  const body = sceneBodyForId(state, bodyId);
  if (body === null) return null;
  const bodyState = sceneBodyStates(state, ctx).get(bodyId);
  if (bodyState === undefined) return null;
  // The SAME pose-provider closure `deriveSlabs` was fed to build this
  // body's slab row (see ReadyFrameContext.bodyPose's doc) — reading it here
  // instead of re-deriving the pose is what keeps this layer's eyeRelBodyM
  // from ever drifting off the basis `view.slab.vp` was actually built from.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  const radiusM = body.radiusM;
  // See composeBodySlabMvp's header: the seam already rotated the camera into
  // the body's fixed axes, so view.slab.vp (built about the eye from that
  // SAME basis) is what this composes against — never the f32-narrowed view.vp.
  const mvpLocal = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM);
  const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, radiusM);
  return { body, bodyState, pose, radiusM, mvpLocal, camLocal };
}

export const earthLayer: ContentLayer = {
  name: 'earth',
  slab: 'body',
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m' || view.slab.frame.bodyId !== 'earth') return false;
    if (state.gpu.earthRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    return state.data.bodies.earth !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.earthRenderer;
    if (renderer === null) return;

    const prepared = prepareBodySurfaceFrame(state, ctx, view);
    if (prepared === null) return;
    const { bodyState: earthState, radiusM, mvpLocal, camLocal } = prepared;
    // Narrow HERE, at the GPU-upload boundary — `prepared.mvpLocal` stays f64
    // for the tile planner's own read of it (see PreparedBodySurfaceFrame's doc).
    const mvp = narrowMat4(mvpLocal);
    const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;

    // Sun direction rotated into Earth's local frame (orientation carries the
    // axial tilt), so the fragment's lighting stays a plain dot product.
    const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
    // Same descent fade the cloud shell itself uses, from the same
    // camera-to-Earth-centre distance enabled's sub-pixel cull reads — the deck
    // and the shadow it casts must dissolve together.
    //
    // KNOWN OMISSION: this fade does not reach the night-side city-lights
    // dimming (nightLights reads cloudAlphaHere with no strength scalar).
    // Fixing that needs one more uniform field — deferred rather than paid
    // for a night-side-only artifact.
    const cameraDistanceMpc = earthCameraDistanceMpc(earthState.positionMpc, ctx);
    const cloudFade = cloudDeckFade(cameraDistanceMpc, radiusMpc);
    const cloudShadowStrength = EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade;

    // ── Detail tiles, resolved BEFORE the base globe draw ──────────────────
    //
    // The base-globe fade below needs to know whether the tile path is
    // actually alive THIS frame: an empty cut or a not-yet-engaged atlas is
    // the ordinary pre-residency picture, not an error, and the base globe
    // MUST stay at its alpha-1 failure floor through it — fading with
    // nothing covering the cap would punch a hole through to whatever is
    // behind Earth.
    const tileRenderer = state.gpu.earthSurfaceTileRenderer;
    const earthTiles = state.subsystems.earthTiles;
    const tiles = earthTiles?.getLastCut() ?? [];
    const surfaceAtlasView = earthTiles?.getAtlasView() ?? null;
    const tilesLive = tileRenderer !== null && surfaceAtlasView !== null && tiles.length > 0;
    const globeAlpha = tilesLive ? baseGlobeFadeAlpha(cameraDistanceMpc, radiusMpc) : 1;

    // Skip the draw call entirely at alpha 0 (the tiles cover the whole cap
    // by then) — this rides the SAME per-frame uniform write as any other
    // alpha, never a second `renderer.draw` (see earthRenderer's
    // at-most-once-per-frame precondition).
    if (globeAlpha > 0) {
      renderer.draw(
        pass,
        packEarthSurfaceUniforms(
          mvp,
          sun,
          camLocal,
          EARTH_SURFACE_PARAMS.roughnessBase,
          EARTH_SURFACE_PARAMS.f0,
          EARTH_SURFACE_PARAMS.sunIrradiance,
          cloudShadowStrength,
          // Unit-sphere local radius of the SAME shell cloudShellLayer draws, so
          // the cast shadow and the drawn deck agree by construction.
          CLOUD_SHELL_PARAMS.radiusRatio,
          // Live user settings, not the WESL consts (seeded from
          // EARTH_SURFACE_PARAMS so the defaults match).
          state.settings.earth.ambientLight,
          state.settings.earth.oceanRoughness,
          globeAlpha,
        ),
      );
    }

    // ── Detail tiles, drawn AFTER the base globe ──────────────────────────
    //
    // `nearer-or-equal` depth compare on the tile pipeline needs the base
    // globe's depth already written — see the module header.
    if (tilesLive) {
      tileRenderer!.draw(pass, {
        tiles,
        frame: ++earthFrameCounter,
        // The slab vp is already eye-relative by construction (body-m rows
        // build vp about the eye) — no rebase, unlike the old NEAR0 path.
        vp: view.vp,
        eyeRelBodyM: prepared.pose.eyeRelBodyM,
        radiusM,
        sunDirLocal: sun,
        roughnessBase: EARTH_SURFACE_PARAMS.roughnessBase,
        f0: EARTH_SURFACE_PARAMS.f0,
        sunIrradiance: EARTH_SURFACE_PARAMS.sunIrradiance,
        ambientLight: state.settings.earth.ambientLight,
        oceanRoughness: state.settings.earth.oceanRoughness,
        cloudShadowStrength,
        cloudShellRadius: CLOUD_SHELL_PARAMS.radiusRatio,
        // DebugPanel's Earth LOD overlay toggle — read live each frame from the
        // DEBUG_OVERLAY_ROWS-derived record, same as the other overlays.
        debugLodOverlay: state.settings.debug.overlays['earth-lod-overlay'],
        surfaceAtlasView: surfaceAtlasView!,
        materialView: renderer.getMapView('material'),
        nightView: renderer.getMapView('night'),
        normalView: renderer.getMapView('normal'),
        cloudsView: renderer.getMapView('clouds'),
      });
    }
  },

  // Stamps Earth's packed identity into the body-slab r32uint pick pass.
  // Earth is the sole body of Source.Earth, so its seed index is the
  // constant 0; the packed id's PICK_SENTINEL_OFFSET keeps a real hit
  // distinct from the cleared-to-zero no-hit texel.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const prepared = prepareBodySurfaceFrame(state, ctx, view);
    if (prepared === null) return;
    const { pose, radiusM } = prepared;

    const { mvp, camPosLocal } = bodySlabFlooredPick(
      view.slab.vp,
      pose.eyeRelBodyM,
      radiusM,
      ctx.drawPxPerRad,
    );

    pickRenderer.drawSphere(pass, {
      mvp,
      camPosLocal,
      packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
    });
  },
};
