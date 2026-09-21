/**
 * frameContext — what is true of this FRAME: one camera, one body-state
 * sample, one clock, derived once at the top of `runFrame`. `deriveView`
 * derives each view of it. Side-effect-free — the camera clock is advanced by
 * `runFrame`'s produce step, not here — so the pick path can call it
 * speculatively between frames.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import type { FrameContextInput } from '../../../@types/engine/frame/FrameContextInput';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { cameraBasisWorld } from '../../../utils/camera/cameraBasisWorld';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { isEngineReady } from '../helpers/engineReady';
import { bodyRelativePose } from '../camera/bodyRelativePose';
import { hostOf } from '../camera/rungs/hostOf';
import { isBodyArm } from '../camera/rungs/isBodyArm';
import { isWorldArm } from '../camera/rungs/isWorldArm';
import { refoldTo } from '../camera/rungs/refoldTo';
import { meshBodySlabHostId } from '../../../utils/meshBodies/meshBodySlabHostId';
import { poseFromBodyArm } from '../../../utils/camera/poseFromBodyArm';
import { terrainHeightAtOf } from '../../../utils/surfaceTiles/terrainHeightAtOf';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';
import { deriveBodyStates } from './deriveBodyStates';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';
import { visibleStars } from './visibleStars';

export function deriveFrameContext(state: EngineState, input: FrameContextInput): FrameContext {
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const { cam, arm, altitudeMpc, nowMs, simDays, visibleSourceMask } = input;

  // This frame's ONE R_body(t) sample (spec §4). `deriveBodyStates` memoizes one
  // deep on `simDays`, so every later `sceneBodyStates(state, ctx)` call this
  // frame returns this SAME Map by reference — no second cache, no drift.
  const bodyStates = deriveBodyStates(simDays);

  // Reruns the SAME roll NEAR0's own vp derivation uses (`imagePlaneBasis` is
  // the shared seam both call, not a copy) so a body row's screen orientation
  // matches NEAR0's — reading `cam.roll` rather than hard-coding 0 is what
  // keeps that true once something sets a non-zero roll.
  const camBasisWorld = cameraBasisWorld(orbitForwardOf(cam), cam.roll ?? 0, cam.upBasis);

  const { earth, planets, meshBodies } = state.data.bodies;
  // A mesh body whose driver hangs off something with no row of its own gets
  // one here, off the STORE roster rather than the static table, so the two
  // stay the same list.
  const hostlessMeshBodies = meshBodies.filter((body) => meshBodySlabHostId(body) === body.id);
  const slabBodyCandidates: readonly SceneBody[] =
    earth === null
      ? [...planets, ...SCENE_ANCHOR_POINT_BODIES, ...hostlessMeshBodies]
      : [earth, ...planets, ...SCENE_ANCHOR_POINT_BODIES, ...hostlessMeshBodies];

  // Provider B serves ONLY the engaged body, straight from its own stored
  // pose — no Mpc round trip. Every other body, and the whole absolute arm,
  // stay on provider A (spec §5.2, ruled S1: "B keeps A"). Gated on the
  // HOST, not the frame: a rung not its own host must still fall through here.
  // `input.cam` is an `AssembledOrbitCamera`: both bases are required, not
  // asserted — `assembleOrbitCamera` always sets them, optional only on
  // `OrbitCameraInit`.
  const armBasisCtx = {
    bodies: bodyStates as ReadonlyMap<BodyId, BodyState>,
    poseBasis: cam.poseBasis,
    upBasis: cam.upBasis,
    terrainHeightAt: terrainHeightAtOf(state.subsystems.surfaceTiles),
  };
  const armHost = hostOf(arm.frame, armBasisCtx);
  // UN-turned: `deriveView` turns this provider's output through `viewBodyPose`
  // so a body arm stays metre-native in every view.
  const bodyPose: BodyPoseProvider = (bodyId) => {
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

  // NEAR0's distanceRangeM (spec §7.1) is sized from the star spheres actually
  // drawn; which star is a sphere is a per-view question, so this resolves the
  // positions once and `deriveView` partitions them.
  const positionedStars = visibleStars(state).map((star) => ({
    ...star,
    positionMpc: bodyStates.get(star.id)!.positionMpc,
  }));

  // `focusBlend` and `focus` are at-rest placeholders that `runFrame` overwrites
  // the moment the ready gate passes, before any consumer reads them: deriving
  // them here would tick the structureFocus fade controller, a once-per-frame
  // side effect this (speculatively callable) function must not have.
  return {
    isReady: true,
    camBasisWorld,
    bodyStates,
    bodyPose,
    slabBodyCandidates,
    meshBodies,
    positionedStars,
    nowMs,
    simDays,
    altitudeMpc,
    visibleSourceMask,
    renderTargets: state.gpu.renderTargets,
    focus: ZERO_FOCUS,
    focusBlend: 0,
    // Stamped by `runFrame` once every Layer's frame hook has voted.
    layersSettling: false,
    // Forwarded by reference, not copied: the listener allocates a fresh pair
    // per pointermove and only while the debug overlay that reads it is on.
    cursorTexPx: state.picking.cursorTexPx,
  };
}
