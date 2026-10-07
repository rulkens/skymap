/**
 * Everything that determines which nodes the GPU cut keeps. `sameStarCut`
 * compares it whole (eye and planes within a slack), so a field added later is compared without a list.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarCutSourceInput } from './StarCutSourceInput';

export type StarCutSpec = {
  /** The eye the cut is taken from; draws rebase their vp about THIS. */
  readonly originMpc: Readonly<Vec3>;
  /** Six unit planes per view, rebased about `originMpc`, in Mpc; empty means no prune. */
  readonly planes: Float32Array;
  readonly refineThreshold: number;
  /** Aggregate cull slack: its glow's spread past the box (world). */
  readonly worldSpread: number;
  /** Leaf cull slack: its dot's radius, radians per unit distance. */
  readonly leafMarginRad: number;
  readonly sources: readonly StarCutSourceInput[];
};
