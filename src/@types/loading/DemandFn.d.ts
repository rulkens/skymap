import type { DemandCtx } from './DemandCtx';

/** A hand-written demand or release test: the transitional `fn` variant of `AssetDemand`. */
export type DemandFn = (ctx: DemandCtx) => boolean;
