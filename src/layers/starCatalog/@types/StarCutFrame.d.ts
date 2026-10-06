/**
 * What the Layer's planner hands the GPU cut and the draws that read it: the
 * frame's cut inputs, already reduced to numbers. The cut itself never leaves
 * the GPU.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { SourceType } from '../../../@types/data/SourceType';

export type StarCutFrame = {
  /** The eye the cut is taken from; draws rebase their vp about THIS. */
  readonly originMpc: Readonly<Vec3>;
  /** Stamps each source's fade step. */
  readonly nowMs: number;
  /** Six unit planes per view, rebased about `originMpc`, in Mpc. */
  readonly planes: Float32Array;
  readonly viewCount: number;
  readonly refineThreshold: number;
  /** Aggregate cull slack: its glow's spread past the box (world). */
  readonly worldSpread: number;
  /** Leaf cull slack: its dot's radius, radians per unit distance. */
  readonly leafMarginRad: number;
  readonly sources: readonly {
    readonly source: SourceType;
    /** The source's distance crossfade. */
    readonly opacity: number;
    readonly budgetTypical: number;
  }[];
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
};
