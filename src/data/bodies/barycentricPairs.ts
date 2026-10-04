/**
 * BARYCENTRIC_PAIRS — primaries whose element row is the pair barycentre. Earth's
 * row is fitted to the Horizons Earth–Moon barycentre (target 3), so Earth itself
 * sits k·(Moon offset) the other way. k = 1 / (1 + M⊕/M☾), M⊕/M☾ = 81.30057 (DE440).
 */

import type { BarycentricPair } from '../../@types/scene/BarycentricPair';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';

const BARYCENTRIC_PAIRS: readonly BarycentricPair[] = [
  { primaryId: 'earth', secondaryId: 'moon', secondaryMassFraction: 1 / 82.30057 },
];

// Primary id → its secondary's element row and mass fraction, resolved at import so
// `deriveBodyStates` does no lookup per instant. A misspelt secondary throws here.
export const BARYCENTRIC_REFLEX_BY_PRIMARY = new Map(
  BARYCENTRIC_PAIRS.map((pair) => [
    pair.primaryId,
    {
      secondary: findByIdOrThrow(ORBITAL_ELEMENTS, pair.secondaryId, 'BARYCENTRIC_PAIRS'),
      k: pair.secondaryMassFraction,
    },
  ]),
);
