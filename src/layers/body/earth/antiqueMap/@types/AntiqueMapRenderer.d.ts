import type { Renderer } from '../../../../../@types/rendering/Renderer';

/** The antique look's Earth geography (`createAntiqueMapRenderer`). */
export type AntiqueMapRenderer = Renderer & {
  /** Draws into the open geography-row pass; the first call starts the map's fetch. */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
