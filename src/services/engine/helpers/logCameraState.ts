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
    (focusRow.type === 'body' || focusRow.type === 'starCatalog')
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

  const out = {
    // The whole restore: `dispatch(commitCameraPose(out.framed))`.
    framed,
    frame: framed === null ? 'absolute' : frameKey(framed.frame),
    // The two numbers `framed` doesn't already print, null off the arm not in
    // play — a body arm's metres (spec §8) and a site arm's height above the
    // tangent plane (spec §4.9).
    eyeFromCentreM:
      framed !== null && isBodyArm(framed) ? Math.hypot(...bodyFixedEyeM(framed.pose)) : null,
    eyeHeightM:
      framed !== null && isSiteArm(framed)
        ? framed.pose.rangeM * Math.sin(framed.pose.elevationRad)
        : null,
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
