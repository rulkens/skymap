import type { AssetProvenance } from './AssetProvenance';
import type { SimilarityTransform } from './SimilarityTransform';

/** Fields every scene asset carries, regardless of `kind`. */
export type AssetCommon = {
  readonly id: string;
  readonly label: string;
  readonly transform: SimilarityTransform;
  readonly provenance: AssetProvenance;
};
