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
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { FadeIdentity } from '../../../@types/animation/FadeIdentity';
import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import { bodySlabRowOf } from '../../../utils/scene/bodySlabRowOf';
import { slabRowActive } from '../../../utils/frame/slabRowActive';
import { cameraBasisWorld } from '../../../utils/camera/cameraBasisWorld';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { isEngineReady } from '../helpers/engineReady';
import { bodyRelativePose } from '../camera/bodyRelativePose';
import { hostOf } from '../camera/rungs/hostOf';
import { isBodyArm } from '../camera/rungs/isBodyArm';
import { isWorldArm } from '../camera/rungs/isWorldArm';
import { refoldTo } from '../camera/rungs/refoldTo';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { HOSTLESS_MESH_BODIES } from '../../../data/bodies/hostlessMeshBodies';
import { poseFromBodyArm } from '../../../utils/camera/poseFromBodyArm';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';
import { deriveBodyStates } from './deriveBodyStates';
import { createFramePlannerResultStore } from './createFramePlannerResultStore';
import { sceneBodyCoverageOf } from '../../../utils/visibility/sceneBodyCoverageOf';
import { fadeIdentityKey } from '../../../utils/visibility/fadeIdentityKey';
import { resolveVisibilityOpacity } from '../presentation/resolveVisibilityOpacity';
import { viewBandOf } from '../presentation/viewBandOf';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';

export function deriveFrameContext(
  state: EngineState,
  input: FrameContextInput,
  /** The frame's one `renderedTargets` fact; `runFrame` passes its own so `renderFrame` gets the SAME mutable `Set`. */
  renderedTargets: Set<string> = new Set(),
): FrameContext {
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const { cam, arm, altitudeMpc, nowMs, simDays } = input;

  // `deriveBodyStates` memoizes on `simDays`, so every later `sceneBodyStates` call
  // this frame returns this SAME Map.
  const bodyStates = deriveBodyStates(simDays);

  // Same roll as NEAR0's vp derivation (shared `imagePlaneBasis`); read `cam.roll`,
  // never 0, so body rows stay aligned once a roll is set.
  const camBasisWorld = cameraBasisWorld(orbitForwardOf(cam), cam.roll ?? 0, cam.upBasis);

  // The ONE presence filter: an absent craft is parked on or in Earth, so every
  // consumer (slab rows, partition, glints, picks) reads this list, never the static roster.
  const meshBodies = SCENE_MESH_BODIES.filter((body) => spacecraftPresent(body.id, simDays));
  // A hostless mesh body (its driver hangs off something with no row of its own)
  // gets a row here; every other row is a Layer's (`state.slabRows`).
  const hostlessMeshBodies = HOSTLESS_MESH_BODIES.filter((body) =>
    spacecraftPresent(body.id, simDays),
  );
  // A banded row exists only while its band is open. Keyed on the FRAME camera, not a
  // view's offset eye: eye separation is metres against a band in AU.
  const slabBodyCandidates: readonly SlabRow[] = [
    ...state.slabRows,
    ...hostlessMeshBodies.map(bodySlabRowOf),
  ].filter((row) => slabRowActive(row, cam.position, bodyStates));

  // Provider B serves ONLY the engaged body, from its own stored pose (no Mpc round
  // trip); everything else, and the whole absolute arm, stays on provider A. Gated on
  // the HOST, not the frame: a rung not its own host must still fall through.
  const armBasisCtx = {
    bodies: bodyStates,
    poseBasis: cam.poseBasis,
    upBasis: cam.upBasis,
    terrainHeightAt: state.terrainHeightAt,
  };
  const armHost = hostOf(arm.frame, armBasisCtx);
  // UN-turned: `deriveView` turns the output through `viewBodyPose`.
  const bodyPose: BodyPoseProvider = (bodyId) => {
    if (!isWorldArm(arm) && armHost !== null && armHost.id === bodyId) {
      // A rung BELOW its host (a site on its planet) folds up to the host's arm first.
      const onHost = refoldTo(arm, { body: armHost.id }, armBasisCtx);
      if (isBodyArm(onHost)) return poseFromBodyArm(onHost.pose);
    }
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) return null;
    return bodyRelativePose({ camPosMpc: cam.position, camBasisWorld, bodyState });
  };

  // Every admitted scene body, positioned once; which is resolved is a per-view
  // question, so each view sorts these. A body some show entry covers is admitted
  // while every covering item hands a value above 0 — the value its passes read, so a
  // star faded, clipped or banded to 0 neither occludes nor sizes NEAR0. The band is
  // measured at the frame camera, the eye slab rows use, for the same reason.
  const coverage = sceneBodyCoverageOf(state.visibilityEntries);
  const frameEye = { drawCamPos: cam.position, snapshot: { bodyStates } };
  const handedAboveZero = new Map<string, boolean>();
  const isAboveZero = (id: FadeIdentity): boolean => {
    const key = fadeIdentityKey(id);
    let above = handedAboveZero.get(key);
    if (above === undefined) {
      above =
        resolveVisibilityOpacity(state, { nowMs }, id.address, id.item) *
          viewBandOf(state.visibilityEntries, id.address, id.item, frameEye) >
        0;
      handedAboveZero.set(key, above);
    }
    return above;
  };
  const sceneBodies: PositionedSceneBody[] = [];
  const admit = (body: SceneBody): void => {
    if (!(coverage.get(body.id)?.coveredBy ?? []).every(isAboveZero)) return;
    sceneBodies.push({ body, positionMpc: bodyStates.get(body.id)!.positionMpc });
  };
  for (const body of SCENE_PLANETS) admit(body);
  for (const body of meshBodies) admit(body);
  for (const { body } of coverage.values()) admit(body);

  // `focus`, `focusBlend` and `focusPickId` are at-rest placeholders that `runFrame`
  // overwrites the moment the ready gate passes, before any consumer reads them:
  // deriving them here would tick the structureFocus fade controller, a once-per-frame
  // side effect this (speculatively callable) function must not have.
  return {
    isReady: true,
    camBasisWorld,
    bodyStates,
    bodyPose,
    slabBodyCandidates,
    meshBodies,
    sceneBodies,
    nowMs,
    simDays,
    altitudeMpc,
    renderTargets: state.gpu.renderTargets,
    focus: ZERO_FOCUS,
    focusBlend: 0,
    focusPickId: null,
    plans: createFramePlannerResultStore(),
    // Forwarded by reference, not copied: the listener allocates a fresh pair
    // per pointermove and only while the debug overlay that reads it is on.
    cursorTexPx: state.picking.cursorTexPx,
    // Empty: `renderFrame` unions into it as every view's program opens a pass.
    renderedTargets,
  };
}
