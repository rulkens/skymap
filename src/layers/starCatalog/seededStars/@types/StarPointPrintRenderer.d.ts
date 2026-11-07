/**
 * StarPointPrintRenderer — the seeded stars' print twin for the antique look:
 * one point per star in `antique-print-points` (`antiqueLook/printPoint.wesl`),
 * from an instance buffer of its own, so it never touches what
 * `starPointRenderer` uploads for the visual draw.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { PrintStar } from './PrintStar';

export type StarPointPrintRenderer = Renderer & {
  /** Upload `stars` and record their points into the begun print pass; `vp` is rebased to the camera. */
  draw(pass: GPURenderPassEncoder, vp: Float32Array, stars: readonly PrintStar[]): void;
};
