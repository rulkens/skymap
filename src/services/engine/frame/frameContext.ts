/**
 * frameContext — a typed snapshot of 'what the world looks like this frame',
 * derived once at the top of `runFrame` and threaded into `renderFrame`.
 *
 * `deriveFrameContext` is side-effect-free: the camera clock is advanced by
 * `runFrame`'s produce step, not here, so the pick path can call it
 * speculatively between frames.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Size } from '../../../@types/rendering/Size';
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { ViewSpec } from '../../../@types/engine/frame/ViewSpec';
import { computeViewProj } from '../../../utils/camera/computeViewProj';
import { symmetricFrustum } from '../../../utils/camera/symmetricFrustum';
import { viewFromCameraEye } from '../../../utils/camera/viewFromCameraEye';
import { turnedOrbitCamera } from '../../../utils/camera/turnedOrbitCamera';
import { multiply3x3 } from '../../../utils/math/multiply3x3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';
import { starSphereRangeM } from '../../../utils/star/starSphereRangeM';
import { outerBoundRadiusM } from '../../../utils/occlusion/outerBoundRadiusM';
import { isEngineReady } from '../helpers/engineReady';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { bodyRelativePose } from '../camera/bodyRelativePose';
import { viewBodyPose } from '../camera/viewBodyPose';
import { hostOf } from '../camera/rungs/hostOf';
import { isBodyArm } from '../camera/rungs/isBodyArm';
import { isWorldArm } from '../camera/rungs/isWorldArm';
import { refoldTo } from '../camera/rungs/refoldTo';
import { bodyStateInHostFrame } from '../../../utils/scene/bodyStateInHostFrame';
import { meshBodiesAttachedTo } from '../../../utils/meshBodies/meshBodiesAttachedTo';
import { meshBodySlabHostId } from '../../../utils/meshBodies/meshBodySlabHostId';
import type { HostFrameSphere } from '../../../@types/scene/HostFrameSphere';
import { poseFromBodyArm } from '../../../utils/camera/poseFromBodyArm';
import { pivotSurfaceRangeMpc } from '../camera/pivotSurfaceRangeMpc';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';
import { deriveSlabs } from './slabs';
import { deriveBodyStates } from './deriveBodyStates';
import { visibleSlabBodies } from './visibleSlabBodies';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';
import { visibleStars } from './visibleStars';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';
import { terrainHeightAtOf } from '../../../utils/surfaceTiles/terrainHeightAtOf';

/**
 * Derive the per-frame context from an already-produced pose and projection.
 *
 * `poseBasis` (the committed `ORIENTATION_FRAMES[orientation]`, which does not
 * move during a roll) decodes the eye position; `upBasis` (the live, possibly
 * mid-slerp `resolveFrameBasis` result) decodes screen-up. The split is what
 * makes an orientation-frame switch roll the horizon instead of sweeping the
 * whole view.
 *
 * `nowMs` is wall-clock ms (fades, ramps); `simDays` is scene time in Julian
 * days (where the planets are). The two decouple whenever the clock is paused
 * or scrubbed, and `nowMs` being threaded rather than sampled per consumer is
 * the seam a frame-by-frame recorder needs to step time deterministically.
 *
 * `arm` is the SAME framed pose `pose` was resolved from (`foldToWorld`,
 * called once by the caller) and serves only the pose-provider seam below
 * (spec §5.2).
 *
 * `altitudeMpc` is the eye-to-pivot-surface range NEAR0's bracket is sized
 * from; absent, it is derived from `pose` and the focused pivot. A capture
 * face passes its own: its synthetic pose orbits no pivot, and the real
 * focus's radius taken off a metre-scale probe distance goes hugely negative.
 *
 * `view` is a rig view (`deriveViewContext`): the SAME pose and arm, turned and
 * offset, through its own frustum and size. Absent = the camera's own view,
 * built with no extra arithmetic so mono stays bit-identical.
 */
export function deriveFrameContext(
  state: EngineState,
  canvasSize: Readonly<Size>,
  pose: CameraPose,
  arm: FramedCameraPose,
  projection: CameraProjection,
  poseBasis: Mat3,
  upBasis: Mat3,
  visibleSourceMask: number,
  nowMs: number,
  simDays: number,
  altitudeMpc?: number,
  view?: ViewSpec,
): FrameContext {
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const renderTargets = state.gpu.renderTargets;

  const cam = assembleOrbitCamera(pose, projection, poseBasis, upBasis);

  const frustum = view?.frustum ?? symmetricFrustum(cam.fovYRad, cam.aspect);
  const viewFromCamEye = view && viewFromCameraEye(view.rotation, view.eyeOffsetMpc);
  const vp = computeViewProj(cam, frustum, viewFromCamEye);

  // This frame's ONE R_body(t) sample (spec §4). `deriveBodyStates` memoizes one
  // deep on `simDays`, so every later `sceneBodyStates(state, ctx)` call this
  // frame returns this SAME Map by reference — no second cache, no drift.
  const bodyStates = deriveBodyStates(simDays);

  const camForward = orbitForwardOf(cam);

  // `camBasisWorld` reruns the SAME roll NEAR0's own vp derivation uses
  // (`imagePlaneBasis` is the shared seam both call, not a copy) so a body row's
  // screen orientation matches NEAR0's — reading `cam.roll` rather than
  // hard-coding 0 is what keeps that true once something sets a non-zero roll.
  // The closure below is forwarded onto `ReadyFrameContext.bodyPose` (the SAME
  // closure, not a second one) so a body-slab layer's own pose read can never
  // drift from the one `slabs` was built from.
  const { right: camRight, up: camUp } = imagePlaneBasis(
    camForward,
    cam.roll ?? 0,
    frameUp(cam.upBasis),
  );
  const camBasisWorld = mat3FromColumns(camRight, camUp, camForward);
  const viewBasisWorld =
    view === undefined ? camBasisWorld : multiply3x3(camBasisWorld, view.rotation);
  const viewForward: Vec3 = [viewBasisWorld[6], viewBasisWorld[7], viewBasisWorld[8]];
  const eyeOffset =
    view === undefined ? null : rotateVec3ByTightMat3(view.eyeOffsetMpc, viewBasisWorld);
  const drawCamPos: Readonly<Vec3> =
    eyeOffset === null
      ? [cam.position[0]!, cam.position[1]!, cam.position[2]!]
      : [
          cam.position[0]! + eyeOffset[0],
          cam.position[1]! + eyeOffset[1],
          cam.position[2]! + eyeOffset[2],
        ];
  // Derivation below stays on `cam` (pose, arm, NEAR0 all turn via `view`);
  // the context carries the view's own camera so no `ctx.cam` reader draws the
  // main orientation. Never fed back to the camera path: framing reads state.
  const viewCam =
    view === undefined ? cam : turnedOrbitCamera(cam, viewBasisWorld, drawCamPos, frustum);
  const { fovYRad } = viewCam;

  const { earth, planets, meshBodies } = state.data.bodies;
  // A mesh body whose driver hangs off something with no row of its own gets
  // one here, off the STORE roster rather than the static table, so the two
  // stay the same list.
  const hostlessMeshBodies = meshBodies.filter((body) => meshBodySlabHostId(body) === body.id);
  const slabBodyCandidates: readonly SceneBody[] =
    earth === null
      ? [...planets, ...SCENE_ANCHOR_POINT_BODIES, ...hostlessMeshBodies]
      : [earth, ...planets, ...SCENE_ANCHOR_POINT_BODIES, ...hostlessMeshBodies];

  const slabGate = {
    bodyStates,
    camPosMpc: drawCamPos,
    camForwardMpc: viewForward,
    frustum,
    viewportHeightPx: canvasSize.height,
    fovYRad,
  };
  const gatedBodies = visibleSlabBodies({ ...slabGate, bodies: slabBodyCandidates });
  // A hosted mesh body owns no slab row — it rides its host's
  // (`meshBodiesPass`), so the host's roster entry is what keeps it drawable; a
  // hostless one keys on itself and is already a candidate above. From a 400 km
  // orbit Earth's ~70° angular radius takes it out of the frustum gate around
  // 126° off-axis, which would blank a mesh body sitting dead centre. The SAME
  // gate run over the mesh bodies re-admits their hosts, so there is one cull
  // applied twice rather than two culls to keep in step.
  const meshHostIds = new Set(
    visibleSlabBodies({ ...slabGate, bodies: meshBodies }).map(meshBodySlabHostId),
  );
  const visibleBodies = gatedBodies.concat(
    slabBodyCandidates.filter((body) => meshHostIds.has(body.id) && !gatedBodies.includes(body)),
  );

  // Provider B serves ONLY the engaged body, straight from its own stored
  // pose — no Mpc round trip. Every other body, and the whole absolute arm,
  // stay on provider A (spec §5.2, ruled S1: "B keeps A"). Gated on the
  // HOST, not the frame: a rung not its own host must still fall through here.
  const armBasisCtx = {
    bodies: bodyStates as ReadonlyMap<BodyId, BodyState>,
    poseBasis,
    upBasis,
    terrainHeightAt: terrainHeightAtOf(state.subsystems.surfaceTiles),
  };
  const armHost = hostOf(arm.frame, armBasisCtx);
  const camBodyPose: BodyPoseProvider = (bodyId) => {
    if (!isWorldArm(arm) && armHost?.id === bodyId) {
      // A rung BELOW its host (a site on its planet) folds up to the host's own
      // arm first — by reference when the arm already is one, so the body arm's
      // path is unchanged and neither crosses the Mpc seam.
      const onHost = refoldTo(arm, { body: bodyId }, armBasisCtx);
      if (isBodyArm(onHost)) return poseFromBodyArm(onHost.pose);
    }
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) return null;
    return bodyRelativePose({ camPosMpc: cam.position, camBasisWorld, bodyState });
  };
  // Both providers' output turned and offset alike, so a body arm stays metre-native.
  const bodyPose: BodyPoseProvider =
    view === undefined
      ? camBodyPose
      : (bodyId) => {
          const relPose = camBodyPose(bodyId);
          return relPose && viewBodyPose(relPose, view.rotation, view.eyeOffsetMpc);
        };

  // Host body id → the mesh bodies riding its slab row (spec's fifth
  // `SceneBody` arm), each resolved into the host's own frame — the SAME
  // `bodyStates` snapshot `bodyPose` reads above, so this can never disagree
  // with a slab row's own pose. Hosts with no mesh-body attachment (every
  // body but Earth, today) get no map entry, and `deriveSlabs` reads a
  // missing entry as `undefined` — see `bodySlabRow`'s `attachedBodies` doc.
  const attachedBodiesByHostId = new Map<string, readonly HostFrameSphere[]>();
  for (const host of slabBodyCandidates) {
    const attached = meshBodiesAttachedTo(host.id);
    if (attached.length === 0) continue;
    const hostState = bodyStates.get(host.id);
    if (hostState === undefined) continue;
    attachedBodiesByHostId.set(
      host.id,
      attached.map((meshBody) => {
        const { posM } = bodyStateInHostFrame(bodyStates.get(meshBody.id)!, hostState);
        return { posM, radiusM: meshBody.boundingRadiusM };
      }),
    );
  }

  // NEAR0's distanceRangeM (spec §7.1): the star spheres actually drawn this
  // frame, not `foregroundFrustum`'s bracket.
  const positionedStars = visibleStars(state).map((star) => ({
    ...star,
    positionMpc: bodyStates.get(star.id)!.positionMpc,
  }));
  const { spheres } = partitionStarsByResolution({
    stars: positionedStars,
    camPosMpc: drawCamPos,
    thresholdPx: STAR_RESOLVE_PX,
    viewportHeightPx: canvasSize.height,
    fovYRad,
  });
  const starRangeM = starSphereRangeM({
    // Outer: distanceRangeM is the painter-sort interval and must SPAN the row's
    // drawn content (Slab.d.ts). Body rows bracket theirs off the same outer
    // footprint (slabs.ts:184), so the star row has to match that currency.
    spheres: spheres.map((star) => ({
      positionMpc: star.positionMpc,
      radiusM: outerBoundRadiusM(star.surface),
    })),
    camPosMpc: drawCamPos,
  });

  // Frame-aware, so an engaged body arm's eye→ground range is not decremented a
  // second time — see `slabs.ts: deriveSlabs`.
  const slabs = deriveSlabs({
    cam,
    frustum,
    viewFromCamEye,
    cosmoVp: vp,
    altitudeMpc: altitudeMpc ?? pivotSurfaceRangeMpc(arm, pose.distance, state.selectionRows.focus),
    pose: bodyPose,
    visibleBodies,
    viewportPx: [canvasSize.width, canvasSize.height] as Vec2,
    starSphereRangeM: starRangeM,
    attachedBodiesByHostId,
  });
  // Symmetric: `tanUp − tanDown` is exactly `2·tan(fovY/2)`, the pre-rig form.
  const drawPxPerRad = canvasSize.height / (frustum.tanUp - frustum.tanDown);

  // `focusBlend` and `focus` are at-rest placeholders that `runFrame` overwrites
  // the moment the ready gate passes, before any consumer reads them: deriving
  // them here would tick the structureFocus fade controller, a once-per-frame
  // side effect this (speculatively callable) function must not have.
  return {
    isReady: true,
    cam: viewCam,
    vp,
    slabs,
    bodyPose,
    canvasSize,
    // Forwarded by reference, not copied: the listener allocates a fresh pair
    // per pointermove and only while the debug overlay that reads it is on.
    cursorTexPx: state.picking.cursorTexPx,
    drawCamPos,
    drawPxPerRad,
    nowMs,
    simDays,
    fovYRad,
    // The main view is slot 0; `cubemapFaceContext` overrides this to
    // `viewSlotBase + face` — see `ReadyFrameContext.viewSlot`'s doc.
    viewSlot: view?.slot ?? 0,
    viewKind: 'frame',
    output: view?.output,
    focusBlend: 0,
    // Stamped by `runFrame` once every Layer's frame hook has voted.
    layersSettling: false,
    visibleSourceMask,
    focus: ZERO_FOCUS,
    renderTargets,
    // The executor populates this as it opens the first pass against each target;
    // a later pass sampling an earlier target's texture reads it to know whether
    // that target actually rendered this frame.
    renderedTargets: new Set<string>(),
  };
}
