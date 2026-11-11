/** Exported so `dustParticleCloud.ts` sizes its mass budget off the SAME disc profile rather than re-deriving it. */
export type DustDiscShape = {
  readonly hDust: number;
  readonly sigmaZ: number;
  readonly sigmaRCap: number;
  readonly sumW: number;
};
