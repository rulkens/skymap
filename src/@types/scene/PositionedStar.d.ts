/**
 * PositionedStar — a `StarBody` paired with the position this frame's body
 * snapshot resolves for it.
 *
 * The star layers need identity, photometry AND a position, but position lives
 * in `BodyState`. The alternative was threading the snapshot itself through
 * `partitionStarsByResolution`, `StarPointRenderer.setStars` and their six call
 * sites; pairing the two halves once keeps `positionMpc` exactly where every
 * consumer already reads it — resolved per frame rather than baked on the
 * record.
 *
 * `source` + `seedIndex` ride along so a pass packs the star's pick id straight
 * from the record (`packSelection(source, seedIndex + PICK_SENTINEL_OFFSET)`)
 * instead of searching the seed tables for its id.
 */

import type { StarBody } from './StarBody';
import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';
import type { Vec3 } from '../math/Vec3';

export type PositionedStar = StarBody & {
  readonly positionMpc: Vec3; // this frame's resolved position, from BodyState
  readonly source: StarCatalogSourceType;
  readonly seedIndex: number;
};
