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
 */

import type { StarBody } from './StarBody';
import type { Vec3 } from '../math/Vec3';

export type PositionedStar = StarBody & {
  readonly positionMpc: Vec3; // this frame's resolved position, from BodyState
};
