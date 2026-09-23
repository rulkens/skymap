/**
 * domeFaceRotations — each dome face's `ViewSpec.rotation`: the face's own
 * (right, up, forward) turned from dome coordinates into camera coordinates
 * by `domeBasis`.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import { DOME_FACES } from '../../data/rendering/domeFaces';
import { multiply3x3 } from '../math/multiply3x3';
import { domeBasis } from './domeBasis';

export function domeFaceRotations(tiltDeg: number): readonly Mat3[] {
  const basis = domeBasis(tiltDeg);
  return DOME_FACES.map((face) => multiply3x3(basis, face));
}
