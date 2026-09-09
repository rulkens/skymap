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
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { computeViewProj } from '../../../utils/camera/computeViewProj';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { normalize3 } from '../../../utils/math/normalize3';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';
import { starSphereRangeM } from '../../../utils/scene/starSphereRangeM';
import { isEngineReady } from '../helpers/engineReady';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { bodyRelativePose } from '../camera/bodyRelativePose';
import { poseFromBodyArm } from '../../../utils/camera/poseFromBodyArm';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';
import { deriveSlabs } from './slabs';
import { deriveBodyStates } from './deriveBodyStates';
import { visibleSlabBodies } from './visibleSlabBodies';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';
import { visibleStars } from './visibleStars';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';

/**
 * Derive the per-frame context from an already-produced pose and projection.
 *
 * `poseBasis` (the committed `ORIENTATION_FRAMES[orientation]`, which does not
 * move during a roll) decodes the eye position; `upBasis` (the live, possibly
 * mid-slerp `resolveFrameBasis` result) decodes screen-up. The split is what
 * makes an orientation-frame switch roll the horizon instead of sweeping the
 * whole view.
 *
 * `state.cam` is only the boot framing camera, NOT the source of the rendered
 * pose; the produced `ctx.cam` is a fresh camera that does not alias it.
 *
 * `nowMs` is wall-clock ms (fades, ramps); `simDays` is scene time in Julian
 * days (where the planets are). The two decouple whenever the clock is paused
 * or scrubbed, and `nowMs` being threaded rather than sampled per consumer is
 * the seam a frame-by-frame recorder needs to step time deterministically.
 *
 * `arm` is the SAME framed pose `pose` was resolved from (`resolveWorldArm`,
 * called once by the caller) and serves only the pose-provider seam below
 * (spec §5.2).
 */
export function deriveFrameContext(
  state: EngineState,
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  arm: FramedCameraPose,
  projection: CameraProjection,
  poseBasis: Mat3,
  upBasis: Mat3,
  visibleSourceMask: number,
  nowMs: number,
  simDays: number,
): FrameContext {
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const galaxyPointRenderer = state.gpu.galaxyPointRenderer;
  const renderTargets = state.gpu.renderTargets;
  const texturedDisks = state.subsystems.texturedDisks;

  const cam = assembleOrbitCamera(pose, projection, poseBasis, upBasis);

  const canvasSize = { width: canvas.width, height: canvas.height };
  const vp = computeViewProj(cam);

  // This frame's ONE R_body(t) sample (spec §4). `deriveBodyStates` memoizes one
  // deep on `simDays`, so every later `sceneBodyStates(state, ctx)` call this
  // frame returns this SAME Map by reference — no second cache, no drift.
  const bodyStates = deriveBodyStates(simDays);

  const camForward = normalize3([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);

  const { earth, planets } = state.data.bodies;
  const slabBodyCandidates: readonly SceneBody[] =
    earth === null
      ? [...planets, ...SCENE_ANCHOR_POINT_BODIES]
      : [earth, ...planets, ...SCENE_ANCHOR_POINT_BODIES];

  const visibleBodies = visibleSlabBodies({
    bodies: slabBodyCandidates,
    bodyStates,
    camPosMpc: cam.position,
    camForwardMpc: camForward,
    viewportWidthPx: canvasSize.width,
    viewportHeightPx: canvasSize.height,
    fovYRad: cam.fovYRad,
  });

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
  // Provider B serves ONLY the engaged body, straight from its own stored
  // pose — no Mpc round trip. Every other body, and the whole absolute arm,
  // stay on provider A (spec §5.2, ruled S1: "B keeps A").
  const bodyPose: BodyPoseProvider = (bodyId) => {
    if (arm.frame !== 'absolute' && arm.frame.body === bodyId) {
      return poseFromBodyArm(arm.pose);
    }
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) return null;
    return bodyRelativePose({ camPosMpc: cam.position, camBasisWorld, bodyState });
  };

  // NEAR0's distanceRangeM (spec §7.1): the star spheres actually drawn this
  // frame, not `foregroundFrustum`'s bracket.
  const positionedStars = visibleStars(state).map((star) => ({
    ...star,
    positionMpc: bodyStates.get(star.id)!.positionMpc,
  }));
  const { spheres } = partitionStarsByResolution({
    stars: positionedStars,
    camPosMpc: cam.position,
    thresholdPx: STAR_RESOLVE_PX,
    viewportHeightPx: canvasSize.height,
    fovYRad: cam.fovYRad,
  });
  const starRangeM = starSphereRangeM({ spheres, camPosMpc: cam.position });

  // The focused pivot's radius (or null) lets the near-field row key its near
  // plane off ALTITUDE rather than raw distance — see `slabs.ts: deriveSlabs`.
  const slabs = deriveSlabs({
    cam,
    cosmoVp: vp,
    pivotRadiusMpc: pivotRadiusMpc(state.selectionRows.focus),
    pose: bodyPose,
    visibleBodies,
    viewportPx: [canvasSize.width, canvasSize.height] as Vec2,
    starSphereRangeM: starRangeM,
  });
  const drawCamPos: Readonly<Vec3> = [cam.position[0]!, cam.position[1]!, cam.position[2]!];
  const drawPxPerRad = canvasSize.height / (2 * Math.tan(cam.fovYRad / 2));

  // `focusBlend` and `focus` are at-rest placeholders that `runFrame` overwrites
  // the moment the ready gate passes, before any consumer reads them: deriving
  // them here would tick the structureFocus fade controller, a once-per-frame
  // side effect this (speculatively callable) function must not have.
  return {
    isReady: true,
    cam,
    vp,
    slabs,
    bodyPose,
    canvasSize,
    drawCamPos,
    drawPxPerRad,
    nowMs,
    simDays,
    fovYRad: cam.fovYRad,
    // The main view. `skyCubemapFaceContext` overrides this to `face + 1` on
    // the contexts it derives — see `ReadyFrameContext.viewSlot`'s doc.
    viewSlot: 0,
    focusBlend: 0,
    visibleSourceMask,
    focus: ZERO_FOCUS,
    galaxyPointRenderer,
    renderTargets,
    // The executor populates this as it opens the first pass against each target;
    // a later pass sampling an earlier target's texture reads it to know whether
    // that target actually rendered this frame.
    renderedTargets: new Set<string>(),
    texturedDisks,
  };
}
