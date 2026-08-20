/**
 * logCameraState — debug aid for the `l` key: dumps the RENDERED frame's pose
 * as ONE lossless JSON blob for reconstructing a failing pose. `cam` and
 * `focusRow` must be the LIVE values the caller assembled this frame
 * (`liveRenderCamera` / `liveFocusRow`) — this module trusts them as-is.
 *
 * `JSON.stringify`'s default formatting only — no `toFixed`/`toPrecision` —
 * because scales span the observable universe (~1e2 Mpc) down to a body's
 * surface (a 50 m altitude at Earth's radius is a ~1e-6 relative offset on
 * `distance`), and digit-limited formatting rounds that to zero.
 *
 * `earthSubCamera` piggybacks off `earthTileSubsystem`'s own last-plan
 * readout rather than re-deriving lon/lat from the focused body's rotation
 * generically: it is `null` whenever Earth's virtual texture isn't engaged
 * (any other focus, or Earth too far out), which is the honest scope — this
 * blob exists to debug THAT feature.
 */

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { EarthTileDebugSnapshot } from '../../../@types/scene/EarthTileDebugSnapshot';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export function logCameraState(
  cam: OrbitCamera | null,
  canvas: HTMLCanvasElement,
  focusRow: SelectionRow | null,
  simDays: number,
  earthSubCamera: EarthTileDebugSnapshot['subCamera'] = null,
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

  const out = {
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
