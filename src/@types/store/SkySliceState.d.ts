import type { SkyBelowHorizon } from '../sky/SkyBelowHorizon';

export type SkySliceState = {
  readonly belowHorizon: SkyBelowHorizon | null;
};
