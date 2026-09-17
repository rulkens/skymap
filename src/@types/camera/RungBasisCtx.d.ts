import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';
import type { TerrainHeightAtLookup } from './TerrainHeightAtLookup';

/** The geometry every rung reader needs; the gesture-time fields live on `RungCtx` (prep plan, D1). */
export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
  /** Only `bodyRung.host`'s `groundRadiusAtM` closure reads this (F3a, spec
   *  §8.3); every construction site states its own answer explicitly rather
   *  than defaulting one in — `datumOnlyTerrainHeight` for a site that cannot
   *  or need not reach the subsystem, the real lookup where it can. */
  readonly terrainHeightAt: TerrainHeightAtLookup;
};
