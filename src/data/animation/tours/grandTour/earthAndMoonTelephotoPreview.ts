/**
 * PREVIEW ONLY (uncommitted): beat 02 as a dolly zoom, in four variants for the
 * owner to compare. From the whole night-side Earth the eye pulls far out while
 * the lens narrows, so Earth keeps its size on screen and the Moon slides in
 * beside it at true relative size; then the lens widens back to 60° as the eye
 * comes in to the side-on overview. Delete once a variant is picked.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  focus,
  frameTo,
  hide,
  moveTarget,
  scene,
  seq,
  show,
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { DEFAULT_FOV_Y_RAD } from '../../../../services/engine/camera/framing/cameraFraming';
import { clockTo } from '../../../../state/tour/clockTo';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { EARTH_AND_MOON_VIEW } from './earthAndMoonView';
import { OPENING_HIDDEN_LABELS } from './openingHiddenLabels';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';
import { WHOLE_EARTH_HEIGHT_M } from './wholeEarthHeightM';

const EARTH = bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS);
const MOON = bodyPositionMpcAt('moon', TOUR_NIGHT_SIM_DAYS);
const SUN = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);
const WHOLE_EARTH_RANGE_MPC = (EARTH_DATUM_RADIUS_M + WHOLE_EARTH_HEIGHT_M) * SCALE_UNITS.M_TO_MPC;
const EARTH_DIAMETER_KM = 12_742;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

const GAP = sub(MOON, EARTH);
const GAP_DIR = norm(GAP);
const GAP_KM = Math.hypot(...GAP) / SCALE_UNITS.KM_TO_MPC;
const NIGHT_VIEW = norm(sub(SUN, EARTH));
const NORTH = ECLIPTIC_FRAME.normal;
const UP_OFF_GAP = norm(sub(NORTH, scale(GAP_DIR, dot(NORTH, GAP_DIR))));

// The view turns only while the lens is wide: through a narrow lens the stars
// sweep the frame at the turn rate over the lens angle. Four steps in one blended
// seq (swing, out with the lens narrowing, back in with it opening, swing to the
// overview), each starting before the last ends, so the camera never rests.
const SWING_SEC = 7;
const OUT_SEC = 10;
const IN_SEC = 11;
const LENS_OPEN_SEC = 8;
const SWING_OUT_SEC = 8;
// Swing→out, out→in, in→swing. The last waits until the lens is nearly wide again.
const OVERLAP_SEC = [2, 2, 4];
const END_HOLD_SEC = 4;
const WIDE_GAPS = 2;
// Centre to centre on screen, in Earth diameters.
const SEPARATION_DIAMETERS = 2;

function telephoto(rangeKm: number, side: 1 | -1): ClipData {
  const sinT = (SEPARATION_DIAMETERS * EARTH_DIAMETER_KM) / GAP_KM;
  const forward = norm(
    add(scale(GAP_DIR, side * Math.sqrt(1 - sinT * sinT)), scale(UP_OFF_GAP, sinT)),
  );
  // The pair's middle on screen, at Earth's depth: the frame barely moves off Earth.
  const midway = scale(GAP, 0.5);
  const target = add(EARTH, sub(midway, scale(forward, dot(midway, forward))));
  const spanKm = (SEPARATION_DIAMETERS + 1) * EARTH_DIAMETER_KM;
  const fovY = (2.2 * spanKm) / rangeKm / (16 / 9);
  const teleMpc = rangeKm * SCALE_UNITS.KM_TO_MPC;
  // From Earth's side the pull-back is a true dolly zoom: Earth keeps its size
  // while the Moon grows behind it, and the shift to the pair's middle rides the
  // zoom (moving the target slides the eye, so the stars stay put). From the Moon's
  // side a straight pull-back would fly the eye past the Moon, so the range reaches
  // beyond it while the lens is still wide and the view still turns.
  const reframe = moveTarget(target, side === 1 ? OUT_SEC : SWING_SEC, 'easeInOutSine');
  const swingMoves =
    side === 1
      ? []
      : [reframe, dollyTo(WIDE_GAPS * GAP_KM * SCALE_UNITS.KM_TO_MPC, SWING_SEC, 'easeInOutSine')];
  const zoomMoves = side === 1 ? [reframe] : [];
  return {
    start: 'live',
    timeline: [
      scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
      frameTo('ecliptic', { over: 0 }),
      focus(null),
      hide([...OPENING_HIDDEN_LABELS, 'missionTrails'], 0),
      all([
        moveTarget(EARTH, 0),
        dollyTo(WHOLE_EARTH_RANGE_MPC, 0),
        aimAlong(NIGHT_VIEW, 0),
        tween('roll', { to: 0, over: 0 }),
        tween('fov', { to: DEFAULT_FOV_Y_RAD, over: 0 }),
      ]),
      seq(
        [
          all([aimAlong(forward, SWING_SEC, 'easeInOutSine'), ...swingMoves]),
          all([
            ...zoomMoves,
            dollyTo(teleMpc, OUT_SEC, 'easeInOutSine'),
            tween('fov', { to: fovY, over: OUT_SEC, ease: 'easeInOutSine' }),
            seq([wait(OUT_SEC - 2), show(['label:body:planet'], 1)]),
          ]),
          all([
            dollyTo(EARTH_AND_MOON_VIEW.distanceMpc, IN_SEC, 'easeInOutSine'),
            tween('fov', { to: DEFAULT_FOV_Y_RAD, over: LENS_OPEN_SEC, ease: 'easeInOutSine' }),
          ]),
          all([
            aimAlong(EARTH_AND_MOON_VIEW.forward, SWING_OUT_SEC, 'easeInOutSine'),
            moveTarget(EARTH_AND_MOON_VIEW.targetMpc, SWING_OUT_SEC, 'easeInOutSine'),
          ]),
        ],
        { overlap: OVERLAP_SEC },
      ),
      // A standalone clip hands the sim clock back when it ends, and Earth leaves the frame.
      wait(END_HOLD_SEC),
    ],
  };
}

export const TELEPHOTO_MOON_SIDE_10M = telephoto(10_000_000, -1);
export const TELEPHOTO_MOON_SIDE_3M = telephoto(3_000_000, -1);
export const TELEPHOTO_EARTH_SIDE_10M = telephoto(10_000_000, 1);
export const TELEPHOTO_EARTH_SIDE_3M = telephoto(3_000_000, 1);
