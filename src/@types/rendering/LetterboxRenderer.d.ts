/**
 * LetterboxRenderer — the film look's two black bars, drawn into the swap
 * target so a capture of the rendered frame carries them.
 */

import type { Renderer } from './Renderer';
import type { Size } from './Size';

export type LetterboxRenderer = Renderer & {
  /** `target`: the swap target's size in pixels; `aspect`: width over height of the picture left between the bars. */
  draw(pass: GPURenderPassEncoder, target: Size, aspect: number): void;
};
