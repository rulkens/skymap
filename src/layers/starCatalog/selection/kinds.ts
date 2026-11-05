import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

export const starCatalogSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'starCatalog' }>
>[] = [
  {
    type: 'starCatalog',
    focus: BODY_FOCUS,
    // Only seeded stars carry captions; a Gaia survey star is InfoCard text only.
    mayHaveLabel: (ref) => SEEDED_STAR_CATALOGS_BY_SOURCE.has(ref.source),
  },
];
