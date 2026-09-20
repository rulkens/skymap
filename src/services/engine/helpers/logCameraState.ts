/**
 * logCameraState — debug aid for the `l` key: dumps the RENDERED frame's pose.
 * `out.framed` is the round-trip key — `commitCameraPose(dump.framed)` restores
 * it exactly; the `target`/`yaw`/`pitch`/`distanceMpc` rows below drop `roll`
 * and are lossy in the surface regime, kept for reading only. Full
 * `JSON.stringify` precision, not `toFixed`, or a metre-scale altitude rounds away.
 */

import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { SurfaceTileDebugSnapshot } from '../../../@types/scene/SurfaceTileDebugSnapshot';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { frameKey } from '../camera/rungs/frameKey';
import { isBodyArm } from '../camera/rungs/isBodyArm';
import { isSiteArm } from '../camera/rungs/isSiteArm';
import { bodyFixedEyeM } from '../../../utils/camera/bodyFixedEyeM';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export function logCameraState(
  cam: OrbitCamera | null,
  canvas: HTMLCanvasElement,
  focusRow: SelectionRow | null,
  simDays: number,
  earthSubCamera: SurfaceTileDebugSnapshot['subCamera'] = null,
  framed: FramedCameraPose | null = null,
): void {
  if (!cam) {
    console.log('[engine] logCameraState: camera not ready yet');
    return;
  }

  const pivotMpc = pivotRadiusMpc(focusRow);
  let derived: { cameraToBodyCenterMpc: number; altitudeMeters: number } | null = null;
  if (
    pivotMpc !== null &&
    focusRow !== null &&
    (focusRow.type === 'body' || focusRow.type === 'star')
  ) {
    // Measured from world positions directly, not `cam.distance` (target-to-
    // camera, which a follow-pan offset can pull away from the body's center)
    // — so a target/body mismatch shows up as a gap between the two numbers.
    const cameraToBodyCenterMpc = distanceMpc(cam.position, focusRow.positionMpc);
    derived = {
      cameraToBodyCenterMpc,
      altitudeMeters: ((cameraToBodyCenterMpc - pivotMpc) / SCALE_UNITS.KM_TO_MPC) * 1000,
    };
  }

  // The stored arm, named (spec §8): a body arm's numbers are body-FIXED
  // metres, so reading the Mpc rows above as the whole truth would mislead.
  // Absent ⇒ absolute, the same rule untagged serialized input parses under.
  const bodyArm = framed !== null && isBodyArm(framed) ? framed.pose : null;
  const siteArm = framed !== null && isSiteArm(framed) ? framed.pose : null;

  const out = {
    // The whole restore: `dispatch(commitCameraPose(out.framed))`.
    framed,
    frame: framed === null ? 'absolute' : frameKey(framed.frame),
    bodyArmMetres:
      bodyArm === null
        ? null
        : {
            anchorLocalM: bodyArm.anchorLocalM,
            eyeRelAnchorM: bodyArm.eyeRelAnchorM,
            eyeFromCentreM: Math.hypot(...bodyFixedEyeM(bodyArm)),
            basisLocal: bodyArm.basisLocal,
          },
    // `eyeHeightM` is metres above the site's tangent plane (spec §4.9) — the
    // one number that shows whether `clampedSitePose`'s floor is doing its job.
    siteArmPose:
      siteArm === null
        ? null
        : {
            headingRad: siteArm.headingRad,
            elevationRad: siteArm.elevationRad,
            rangeM: siteArm.rangeM,
            eyeHeightM: siteArm.rangeM * Math.sin(siteArm.elevationRad),
          },
    target: cam.target,
    yaw: cam.yaw,
    pitch: cam.pitch,
    distanceMpc: cam.distance,
    fovYRad: cam.fovYRad,
    worldPositionMpc: cam.position,
    simDays,
    viewport: {
      cssWidthPx: canvas.clientWidth,
      cssHeightPx: canvas.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    focus: focusRow,
    pivotRadiusMpc: pivotMpc,
    derived,
    earthSubCamera,
  };

  console.log('[engine] camera state (full precision):', JSON.stringify(out, null, 2));
}
