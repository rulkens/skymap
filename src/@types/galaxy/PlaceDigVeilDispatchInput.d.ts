import type { DigVeilBudget } from './DigVeilBudget';
import type { PlaceDigVeilWarp } from './PlaceDigVeilWarp';

export type PlaceDigVeilDispatchInput = {
  readonly seed: number;
  readonly budget: DigVeilBudget;
  readonly reservationOffset: number;
  readonly generatorIsFluid: boolean;
  readonly cdfRings: number;
  readonly cdfAz: number;
  readonly cdfRMin: number;
  readonly cdfRMax: number;
  readonly warp: PlaceDigVeilWarp;
  /** The DIG-dedicated arm-biased CDF scan's output — see `createGalaxyFieldRenderer.ts`'s `digCdfScan`. Own instance/buffer from dust's, never shared (two weight tables writing the same buffer would race across the two tiers' own deferred dispatches). */
  readonly prefixBuffer: GPUBuffer;
  readonly hiiCompsBuffer: GPUBuffer;
};
