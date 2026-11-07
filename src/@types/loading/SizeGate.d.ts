import type { SceneBodyId } from '../scene/SceneBodyId';

/** Load when `body`'s apparent diameter on the largest drawing view reaches `loadPx`, release
 *  below `releasePx`; `loadPx > releasePx > 0`, so the gap between the two is the hysteresis. */
export type SizeGate = {
  readonly body: SceneBodyId;
  readonly loadPx: number;
  readonly releasePx: number;
};
