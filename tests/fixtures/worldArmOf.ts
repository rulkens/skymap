/**
 * The world arm of a `FramedCameraPose`, for tests whose subject only ever
 * produces the absolute arm. Throws on a body arm so a fixture mistake fails
 * loudly instead of quietly asserting against the wrong shape.
 */

import type { CameraPose } from '../../src/@types/camera/CameraPose';
import type { FramedCameraPose } from '../../src/@types/camera/FramedCameraPose';

export function worldArmOf(framed: FramedCameraPose): CameraPose {
  if (framed.frame !== 'absolute') throw new Error('expected the absolute arm');
  return framed.pose;
}
