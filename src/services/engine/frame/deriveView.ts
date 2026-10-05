/**
 * deriveView — one view of a frame: the frame camera (pose-true, passed in
 * beside the snapshot — never read off `snapshot.cam`), turned and offset by
 * a `ViewSpec`, through that view's own frustum and size. The frame context
 * rides along by reference as `snapshot`, so every view of a frame shares its
 * clock, body states and stamps.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { ViewSpec } from '../../../@types/engine/frame/ViewSpec';
import type { HostFrameSphere } from '../../../@types/scene/HostFrameSphere';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import { computeViewProj } from '../../../utils/camera/computeViewProj';
import { viewFromCameraEye } from '../../../utils/camera/viewFromCameraEye';
import { turnedOrbitCamera } from '../../../utils/camera/turnedOrbitCamera';
import { multiply3x3 } from '../../../utils/math/multiply3x3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { starSphereRangeM } from '../../../utils/star/starSphereRangeM';
import { outerBoundRadiusM } from '../../../utils/occlusion/outerBoundRadiusM';
import { bodyStateInHostFrame } from '../../../utils/scene/bodyStateInHostFrame';
import { meshBodiesAttachedTo } from '../../../utils/meshBodies/meshBodiesAttachedTo';
import { meshBodySlabHostId } from '../../../utils/meshBodies/meshBodySlabHostId';
import { bodySlabRowOf } from '../../../utils/scene/bodySlabRowOf';
import { viewBodyPose } from '../camera/viewBodyPose';
import { deriveSlabs } from './slabs';
import { visibleSlabBodies } from './visibleSlabBodies';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';

export function deriveView(
  snapshot: ReadyFrameContext,
  cam: OrbitCamera,
  spec: ViewSpec,
): FrameView {
  const { bodyStates, slabBodyCandidates, meshBodies, positionedStars } = snapshot;
  const { id, rotation, eyeOffsetMpc, frustum, sizePx } = spec;

  const viewFromCamEye = viewFromCameraEye(rotation, eyeOffsetMpc);
  const vp = computeViewProj(cam, frustum, viewFromCamEye, spec.clipYFlip);

  const viewBasisWorld = multiply3x3(snapshot.camBasisWorld, rotation);
  const viewForward: Vec3 = [viewBasisWorld[6], viewBasisWorld[7], viewBasisWorld[8]];
  const eyeOffset = rotateVec3ByTightMat3(eyeOffsetMpc, viewBasisWorld);
  const drawCamPos: Readonly<Vec3> = [
    cam.position[0]! + eyeOffset[0],
    cam.position[1]! + eyeOffset[1],
    cam.position[2]! + eyeOffset[2],
  ];
  // The derivation below stays on the pose-true `cam` — pose, arm and NEAR0
  // all turn through `viewFromCamEye` — but the view carries its own camera,
  // so no `ctx.cam` reader draws the frame's orientation instead of this view's.
  const viewCam = turnedOrbitCamera(cam, viewBasisWorld, drawCamPos, frustum);
  // Canonical form — every downstream gate reads THIS, never a
  // `(viewportHeightPx, fovYRad)` reconstruction, which is only ulp-accurate
  // for a symmetric frustum.
  const pxPerRad = sizePx.height / (frustum.tanUp - frustum.tanDown);

  const slabGate = {
    bodyStates,
    camPosMpc: drawCamPos,
    camForwardMpc: viewForward,
    frustum,
    pxPerRad,
  };
  const gatedRows = visibleSlabBodies({ ...slabGate, rows: slabBodyCandidates });
  // A hosted mesh body owns no slab row — it rides its host's
  // (`meshBodiesPass`), so the host's roster entry is what keeps it drawable; a
  // hostless one keys on itself and is already a candidate. From a 400 km
  // orbit Earth's ~70° angular radius takes it out of the frustum gate around
  // 126° off-axis, which would blank a mesh body sitting dead centre. The SAME
  // gate run over the mesh bodies re-admits their hosts, so there is one cull
  // applied twice rather than two culls to keep in step. The body rides along
  // on the row so the surviving rows can name their hosts.
  const meshHostIds = new Set(
    visibleSlabBodies({
      ...slabGate,
      rows: meshBodies.map((body) => ({ ...bodySlabRowOf(body), body })),
    }).map((row) => meshBodySlabHostId(row.body)),
  );
  const visibleRows = gatedRows.concat(
    slabBodyCandidates.filter((row) => meshHostIds.has(row.anchorId) && !gatedRows.includes(row)),
  );

  // Both providers' output turned and offset alike, so a body arm stays
  // metre-native; unconditional because an identity turn and a zero offset are
  // exact, so the canvas view needs no short-circuit.
  const bodyPose: BodyPoseProvider = (bodyId) => {
    const relPose = snapshot.bodyPose(bodyId);
    return relPose && viewBodyPose(relPose, rotation, eyeOffsetMpc);
  };

  // Host body id → the mesh bodies riding its slab row (spec's fifth
  // `SceneBody` arm), each resolved into the host's own frame — the SAME
  // `bodyStates` snapshot `bodyPose` reads above, so this can never disagree
  // with a slab row's own pose. Hosts with no mesh-body attachment (every
  // body but Earth, today) get no map entry, and `deriveSlabs` reads a
  // missing entry as `undefined` — see `bodySlabRow`'s `attachedBodies` doc.
  const attachedBodiesByHostId = new Map<string, readonly HostFrameSphere[]>();
  for (const host of slabBodyCandidates) {
    const attached = meshBodiesAttachedTo(host.anchorId);
    if (attached.length === 0) continue;
    const hostState = bodyStates.get(host.anchorId);
    if (hostState === undefined) continue;
    attachedBodiesByHostId.set(
      host.anchorId,
      attached.map((meshBody) => {
        const { posM } = bodyStateInHostFrame(bodyStates.get(meshBody.id)!, hostState);
        return { posM, radiusM: meshBody.boundingRadiusM };
      }),
    );
  }

  // NEAR0's distanceRangeM (spec §7.1): the star spheres actually drawn in
  // THIS view, not `foregroundFrustum`'s bracket.
  const { spheres } = partitionStarsByResolution({
    stars: positionedStars,
    camPosMpc: drawCamPos,
    thresholdPx: STAR_RESOLVE_PX,
    pxPerRad,
  });
  const starRangeM = starSphereRangeM({
    // Outer: distanceRangeM is the painter-sort interval and must SPAN the row's
    // drawn content (Slab.d.ts). Body rows bracket theirs off the same outer
    // footprint (`bodySlabRow`'s `marginM`), so the star row has to match that currency.
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
    altitudeMpc: snapshot.altitudeMpc,
    pose: bodyPose,
    visibleRows,
    viewportPx: [sizePx.width, sizePx.height] as Vec2,
    starSphereRangeM: starRangeM,
    attachedBodiesByHostId,
    clipYFlip: spec.clipYFlip,
  });

  return {
    id,
    snapshot,
    cam: viewCam,
    vp,
    slabs,
    bodyPose,
    canvasSize: sizePx,
    drawCamPos,
    frustum,
    drawPxPerRad: pxPerRad,
    viewSlot: spec.slot,
    viewKind: spec.kind,
    output: spec.output,
  };
}
