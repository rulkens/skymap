/**
 * bodyPhasePose — the camera pose that shows a body lit to a given phase at a
 * given instant, framed to fill the shot. Pure: the instant alone fixes the
 * body's place, read from the engine's own `deriveBodyStates`, so this is the
 * pose the capture will get without a browser in the loop.
 */
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { BODY_FOCUS_PREFIX } from '../../../src/services/url/bodyFocusId';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { ECLIPTIC_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { bodyFootprintRadiusM } from '../../../src/utils/scene/bodyFootprintRadiusM';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { cross3 } from '../../../src/utils/math/cross3';
import { orbitAnglesLookingAlong } from '../../../src/utils/camera/orbitAnglesLookingAlong';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

/** Fraction of the frame's half-height the body's disc spans. */
const FILL = 0.55;

/**
 * `phaseDeg` swings the camera around the body from the sunward direction: 0°
 * is full, 180° is new (an unlit disc), and the two halves of the turn mirror
 * each other — under 180° the lit limb falls right of the terminator, over 180°
 * it falls left. So 45° is a waxing gibbous and 315° the waning one.
 */
export function bodyPhasePose(
  focusId: string,
  instantIso: string,
  phaseDeg: number,
  fovYRad: number,
): CameraPose {
  const bodyId = focusId.startsWith(BODY_FOCUS_PREFIX)
    ? focusId.slice(BODY_FOCUS_PREFIX.length)
    : focusId;
  const body = findByIdOrThrow(SCENE_BODIES, bodyId, 'bodyPhasePose');
  const instantMs = Date.parse(instantIso);
  if (Number.isNaN(instantMs)) throw new Error(`capture instant '${instantIso}' is not a date`);
  const state = deriveBodyStates(unixMsToJulianDays(instantMs)).get(bodyId);
  if (state === undefined)
    throw new Error(`body '${bodyId}' has no derived state at ${instantIso}`);

  const position = state.positionMpc;
  // The Sun sits at the heliocentric origin, so this is the lit direction.
  const sunward = normalize3([-position[0], -position[1], -position[2]]);
  // Swing off it about the ecliptic pole, which screen-up derives from, so the
  // terminator runs down the frame rather than across it.
  const side = normalize3(cross3(sunward, ECLIPTIC_FRAME.normal as Vec3));
  const phaseRad = (phaseDeg * Math.PI) / 180;
  const cos = Math.cos(phaseRad);
  const sin = Math.sin(phaseRad);
  const toCamera: Vec3 = [
    cos * sunward[0] + sin * side[0],
    cos * sunward[1] + sin * side[1],
    cos * sunward[2] + sin * side[2],
  ];
  // The app decodes (yaw, pitch) through the orientation basis, so the inverse
  // must run through the same one — a hand-rolled atan2/asin lands the camera
  // somewhere else on the sphere, differently for every body.
  const { yaw, pitch } = orbitAnglesLookingAlong(
    [-toCamera[0], -toCamera[1], -toCamera[2]],
    ORIENTATION_FRAMES.ecliptic,
  );
  const radiusMpc = bodyFootprintRadiusM(body) / SCALE_UNITS.MPC_TO_M;
  return {
    target: [position[0], position[1], position[2]],
    yaw,
    pitch,
    distance: radiusMpc / (FILL * Math.tan(fovYRad / 2)),
  };
}
