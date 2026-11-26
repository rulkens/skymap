import type { EffectPath } from './EffectPath';

/** The compiler's walk window for one effect. `endSec - startSec` is the AWAITED duration (0 for cues, a fork, an osc). */
export type EffectSpan = {
  readonly path: EffectPath;
  readonly startSec: number;
  readonly endSec: number;
  /** flyPath only: absolute arrival second at each waypoint, one per waypoint, the last equal to `endSec`. */
  readonly knotSecs?: readonly number[];
};
