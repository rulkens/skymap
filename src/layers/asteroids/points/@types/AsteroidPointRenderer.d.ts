/**
 * AsteroidPointRenderer — one additive dot per row the Kepler solver kept, into the depthless HDR
 * target, drawn indirect from its `visible` list; draws nothing until the solver has rows.
 */
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { AsteroidPointFrame } from './AsteroidPointFrame';

export type AsteroidPointRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, frame: AsteroidPointFrame): void;
  /** The same dots as pick words, into the overlay pick target; `frame` is the pick window's. */
  drawPick(pass: GPURenderPassEncoder, frame: AsteroidPointFrame): void;
};
