/**
 * AsteroidPointRenderer — one additive dot per catalog row into the depthless HDR target, placed by
 * the Kepler solver's `helio` buffer; draws nothing until the solver has rows.
 */
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { AsteroidPointFrame } from './AsteroidPointFrame';

export type AsteroidPointRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, frame: AsteroidPointFrame): void;
  /** The same dots as pick words, into the overlay pick target; `frame` is the pick window's. */
  drawPick(pass: GPURenderPassEncoder, frame: AsteroidPointFrame): void;
};
