/**
 * The dome's fisheye as an `OutputProjection`: a square image `diameterPx` across whose view
 * space is the dome frame itself (+y zenith, +z front, +x right), the eye at the origin.
 */

import type { OutputProjection } from '../../../src/@types/rendering/OutputProjection';

export function equidistantFixture(diameterPx: number): OutputProjection {
  return {
    kind: 'equidistant',
    viewFromWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    camHi: [0, 0, 0],
    camLo: [0, 0, 0],
    up3: [0, 1, 0],
    sizePx: [diameterPx, diameterPx],
    centrePx: [diameterPx / 2, diameterPx / 2],
    focalPx: diameterPx / Math.PI,
    pxScale: 1,
  };
}
