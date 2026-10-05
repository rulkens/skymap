import type { Renderer } from '../Renderer';
import type { SurfaceTileDrawArgs } from './SurfaceTileDrawArgs';

export type SurfaceTileRenderer = Renderer & {
  /**
   * Rebuild the per-frame `PatchInstance` buffer from `args.tiles` and issue
   * one instanced indexed draw. No-op if `tiles` is empty.
   */
  draw(pass: GPURenderPassEncoder, args: SurfaceTileDrawArgs): void;
};
