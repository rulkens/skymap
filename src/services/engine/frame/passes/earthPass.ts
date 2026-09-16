/**
 * earthPass — Earth's `'body'`-slab content row: the base globe, drawn into
 * `foreground:0`. The detail patches over it are `surfaceTilesPass`.
 *
 * Earth's `body-m` slab row IS the visibility gate (Task 1 culls it at
 * sub-pixel), so `enabled` mainly checks `view.slab.frame.bodyId === 'earth'`;
 * the foreground-distance check below is the one gate this layer still owns,
 * shared with `planetsPass`.
 *
 * `earthRenderer.draw` writes ONE non-dynamic uniform buffer, so this row
 * draws the base globe AT MOST once per frame (see that renderer's header for
 * the `writeBuffer`-vs-`submit` race a second draw would trigger). The globe is
 * ALWAYS drawn: it sits at the datum's inner bound (§7.4), so it cannot occlude
 * relief, and it is what covers ground no resident patch does yet.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { CelestialBody } from '../../../../@types/scene/CelestialBody';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyRelativePose } from '../../../../@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packEarthSurfaceUniforms } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { cloudDeckFade } from '../../../../utils/scene/cloudDeckFade';
import { bodyCameraDistanceMpc } from '../../../../utils/scene/bodyCameraDistanceMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { bodySlabFlooredPick } from '../../helpers/bodySlabFlooredPick';
import { sceneBodyStates } from '../sceneBodyStates';

/**
 * The registry record for `bodyId`, searched across every store the body-slab
 * layers can seed a row from. Mirrors `sceneBodyStates`' own null-safety
 * (missing ⇒ `null`, never a crash) rather than assuming Earth.
 */
function sceneBodyForId(state: PassState, bodyId: BodyId): CelestialBody | null {
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
 * `starCatalogPass.ts`), so whichever call site reaches it first in a frame
 * does the work and the rest read the cache — keyed on `bodyId`, not just
 * `ctx`, because a single ctx now serves every body-slab row and a `ctx`-only
 * memo would return Earth's frame for any other body sharing the same frame.
 */
export type PreparedBodySurfaceFrame = {
  readonly body: CelestialBody;
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

export function prepareBodySurfaceFrame(
  state: PassState,
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
  state: PassState,
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
  // Datum, not a bound: tiles displace off the datum sphere, so the mvp scale and
  // the radius the tile cut is planned against must be that same number. F2 shrinks
  // only the BASE globe (to the inner bound) so relief cannot poke through it (§7.4).
  const radiusM = body.surface.datumRadiusM;
  // See composeBodySlabMvp's header: the seam already rotated the camera into
  // the body's fixed axes, so view.slab.vp (built about the eye from that
  // SAME basis) is what this composes against — never the f32-narrowed view.vp.
  const mvpLocal = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM);
  const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, radiusM);
  return { body, bodyState, pose, radiusM, mvpLocal, camLocal };
}

export const earthPass: ContentPass = {
  name: 'earth',

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
    const { body, bodyState: earthState, radiusM } = prepared;
    // The base globe alone draws at the INNER bound (datum + reliefM[0], never
    // positive) so a below-datum trench can never be occluded by it (§7.4,
    // F2-R5) — its own frame, recomposed here at the GPU-upload boundary.
    // `prepared.mvpLocal`/`camLocal` stay on the datum for the tile planner
    // and drawPick, which read the same memo.
    const baseGlobeRadiusM = innerBoundRadiusM(body.surface);
    const mvp = narrowMat4(
      composeBodySlabMvp(view.slab.vp, prepared.pose.eyeRelBodyM, baseGlobeRadiusM),
    );
    const camLocal = bodySlabCamLocal(prepared.pose.eyeRelBodyM, baseGlobeRadiusM);
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
    const cloudFade = cloudDeckFade(
      bodyCameraDistanceMpc(earthState.positionMpc, ctx.drawCamPos),
      radiusMpc,
    );
    const cloudShadowStrength = EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade;

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
        // Unit-sphere local radius of the SAME shell cloudShellPass draws, so
        // the cast shadow and the drawn deck agree by construction.
        CLOUD_SHELL_PARAMS.radiusRatio,
        // Live user settings, not the WESL consts (seeded from
        // EARTH_SURFACE_PARAMS so the defaults match).
        state.settings.earth.ambientLight,
        state.settings.earth.oceanRoughness,
      ),
    );
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
