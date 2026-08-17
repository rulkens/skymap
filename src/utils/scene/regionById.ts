/**
 * regionById — a `BodyRegion` by id, for the near-field edges derived from one
 * SPECIFIC region's extent (the caption gate, the two backdrop bands).
 *
 * Throws where its sibling `regionOfBody` returns `null`, because the inputs
 * differ in kind: a body id is open, a `BodyRegionId` is a closed union over a
 * table that must carry every member, so a miss is a lost row rather than a
 * body without a home. A `null` here would push `?? 0` into every module-scope
 * constant that reads an extent, and a silently 0 extent collapses its gate.
 */

import { BODY_REGIONS } from '../../data/bodies/bodyRegions';
import type { BodyRegion } from '../../@types/scene/BodyRegion';
import type { BodyRegionId } from '../../@types/data/BodyRegionId';

export function regionById(id: BodyRegionId): BodyRegion {
  const region = BODY_REGIONS.find((candidate) => candidate.id === id);
  if (region === undefined) throw new Error(`BODY_REGIONS carries no row for '${id}'`);
  return region;
}
