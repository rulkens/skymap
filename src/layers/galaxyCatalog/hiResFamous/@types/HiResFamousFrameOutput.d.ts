import type { HiResFamousPerGalaxyState } from './HiResFamousPerGalaxyState';

export type HiResFamousFrameOutput = {
  /**
   * Per-Famous-source local index → state.  Missing keys default to
   * `{ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 }` at the consumer
   * (so galaxies under the gate, mid-fetch, or without a curated
   * `full.webp` simply fall through to atlas-tile-only rendering).
   */
  readonly byFamousIdx: ReadonlyMap<number, HiResFamousPerGalaxyState>;
};
