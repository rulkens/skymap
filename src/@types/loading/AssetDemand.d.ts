/**
 * What makes a row's asset load and release, declared as data that one evaluator
 * (`evaluateAssetDemand`) reads.
 */

import type { AssetKey } from './AssetKey';
import type { DeclaredDemand } from './DeclaredDemand';
import type { DemandFn } from './DemandFn';

export type AssetDemand =
  | 'always'
  | 'whenSearching'
  /** What `expandCompanionRows` emits. */
  | { readonly companionOf: AssetKey }
  /** Transitional, PR B deletes it: body textures and mesh rows only. */
  | { readonly fn: DemandFn; readonly release?: DemandFn }
  | DeclaredDemand;
