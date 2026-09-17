import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';
import type { TerrainHeightAtLookup } from './TerrainHeightAtLookup';

/** The geometry every rung reader needs; the gesture-time fields live on `RungCtx` (prep plan, D1). */
export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
  /**
   * Optional: only `bodyRung.host`'s `groundRadiusAtM` closure reads it
   * (F3a, spec §8.3). Every other `hostOf`/`foldToWorld` caller wants
   * identity/radius only and never calls `groundRadiusAtM`, so its bare
   * `{bodies, poseBasis, upBasis}` literal stays valid without one — only the
   * production climb ctx (`stepCameraRuntime`'s `rungFields`) supplies the
   * subsystem-backed lookup.
   */
  readonly terrainHeightAt?: TerrainHeightAtLookup;
};
