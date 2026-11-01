/**
 * composeTemeToWorld — the one rotation that takes every satellite's TEME state into the world
 * frame at a sim instant: TEME → Earth-fixed by Greenwich mean sidereal time (what SGP4's own
 * `eciToEcf` does), then Earth-fixed → world by Earth's orientation. Going through Earth's own
 * rotation row keeps the points on the ground tracks of the globe Skymap draws.
 */
import { gstime } from '../load/satelliteJsCore';
import { multiply3x3 } from '../../../utils/math/multiply3x3';
import { rotZMat3 } from '../../../utils/math/rotZMat3';
import type { Mat3 } from '../../../@types/math/Mat3';

export function composeTemeToWorld(earthOrientation: Readonly<Mat3>, simDays: number): Mat3 {
  return multiply3x3(earthOrientation, rotZMat3(-gstime(simDays)));
}
