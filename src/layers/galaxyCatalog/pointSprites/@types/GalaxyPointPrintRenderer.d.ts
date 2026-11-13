/**
 * GalaxyPointPrintRenderer — the galaxy points' print twin for the antique look:
 * one point per galaxy into `antique-print-points` (`points/vertexPrint.wesl`),
 * from the visual pass's own vertex buffers and an image of its uniforms.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { PickSourceDraw } from './PickSourceDraw';

export type GalaxyPointPrintRenderer = Renderer & {
  /** Upload `uniformBytes` (`printUniformBytesOf`) and record one point draw per source into the begun print pass. */
  draw(
    pass: GPURenderPassEncoder,
    sources: readonly PickSourceDraw[],
    uniformBytes: ArrayBuffer,
  ): void;
};
