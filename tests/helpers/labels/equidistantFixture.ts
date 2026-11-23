/**
 * The dome's fisheye as an `OutputProjection`: an image `widthPx` × `heightPx` (square when
 * the height is omitted) whose view space is the dome frame itself (+y zenith, +z front,
 * +x right), the eye at the origin.
 */

import type { OutputProjection } from '../../../src/@types/rendering/OutputProjection';

export function equidistantFixture(widthPx: number, heightPx = widthPx): OutputProjection {
  return {
    kind: 'equidistant',
    viewFromWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    camHi: [0, 0, 0],
    camLo: [0, 0, 0],
    up3: [0, 1, 0],
    sizePx: [widthPx, heightPx],
    centrePx: [widthPx / 2, heightPx / 2],
    focalPx: Math.min(widthPx, heightPx) / Math.PI,
    pxScale: 1,
  };
}
