import type { Renderer } from './Renderer';
import type { Label3D } from './Label3D';
import type { Vec2 } from '../math/Vec2';

/**
 * Label3DRenderer — the shared world-geometry text renderer (spec §9.1).
 * Draws any number of labels, each with its own arc placement, font, and
 * repeat count, following `labelRenderer`'s per-label-storage /
 * per-glyph-instance buffer split.
 */
export type Label3DRenderer = Renderer & {
  setLabels(labels: readonly Label3D[]): void;
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
  glyphCount(): number;
  destroy(): void;
};
