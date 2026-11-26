import type { UserCatalog } from '../UserCatalog';
import type { WeightUnitWarning } from '../weights/WeightUnitWarning';

/**
 * CatalogLoadOutcome — what reading the chosen files came to. A warning holds
 * the parsed catalog, so "Load anyway" loads it without parsing again.
 */
export type CatalogLoadOutcome =
  | { readonly kind: 'ready'; readonly catalog: UserCatalog }
  | { readonly kind: 'warning'; readonly warning: WeightUnitWarning; readonly catalog: UserCatalog }
  | { readonly kind: 'problem'; readonly message: string; readonly showExample: boolean };
