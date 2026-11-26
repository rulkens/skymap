import type { ShowKey } from '../../animation/ShowKey';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { PassState } from '../frame/PassState';
import type { SampledTrailRow } from './SampledTrailRow';

export type SampledTrailGroup = {
  /** The show entry whose value fades this group's trails. */
  readonly show: ShowKey;
  /** Bodies on a `sampled` position, each with its trail tint (linear HDR). */
  readonly rows: readonly SampledTrailRow[];
  /** Read each frame: draw a body's stay near a planet around that planet. Absent = never. */
  nearPlanets?(state: PassState): boolean;
  /** Read each frame: an opacity factor for one row. Absent = 1. */
  dim?(state: PassState, id: SceneBodyId): number;
};
