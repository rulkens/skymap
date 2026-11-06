/**
 * What makes a row's asset load and release, declared as data that one evaluator
 * (`evaluateAssetDemand`) reads.
 */

import type { AssetKey } from './AssetKey';
import type { DeclaredDemand } from './DeclaredDemand';

export type AssetDemand =
  | 'always'
  | 'whenSearching'
  /** What `expandCompanionRows` emits. */
  | { readonly companionOf: AssetKey }
  | DeclaredDemand;
