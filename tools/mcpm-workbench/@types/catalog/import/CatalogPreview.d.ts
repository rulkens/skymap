import type { CatalogLoadOutcome } from './CatalogLoadOutcome';
import type { MeanStdDev } from '../../math/MeanStdDev';
import type { UserCatalogLoad } from '../UserCatalogLoad';

/**
 * CatalogPreview — the chosen files under one set of import settings, with the
 * figures the load dialog shows, all worked out off the main thread. The bounds
 * and weight are null without points; `fitBounds` is what Auto fit would fit
 * the Selection box to at the requested percent.
 */
export type CatalogPreview = {
  readonly outcome: CatalogLoadOutcome;
  readonly bounds: UserCatalogLoad['fitBounds'];
  readonly weight: MeanStdDev | null;
  readonly fitBounds: UserCatalogLoad['fitBounds'];
};
