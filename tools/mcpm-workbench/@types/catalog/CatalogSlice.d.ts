import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../packages/shared/src/@types/data/Tier';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { CatalogPoints } from './CatalogPoints';
import type { UserCatalog } from './UserCatalog';
import type { UserFileProvenance } from './UserFileProvenance';

/**
 * CatalogSlice — which catalogs feed the sim, and what the last load produced.
 * `userCatalog` is the visitor's loaded file, kept while `userCatalogOn` toggles
 * it in and out of the run beside `sources`. `catalogBoundsMpc` is cached so
 * Auto fit does not rescan the positions.
 */
export type CatalogSlice = {
  readonly sources: readonly GalaxyCatalogId[];
  readonly tier: Tier;
  /** The last completed load's points, null until the first `catalogLoaded`. A build
   * derives weights from them, since `weightMode` can change without a reload. */
  readonly points: CatalogPoints | null;
  /** The loaded file inside `points`, null when off; a build records it for the export. */
  readonly pointsUserFile: UserFileProvenance | null;
  readonly pointCount: number;
  readonly nanFillCount: number;
  readonly weightMode: 'stellarMass' | 'uniform';
  readonly userCatalog: UserCatalog | null;
  readonly userCatalogOn: boolean;
  readonly catalogBoundsMpc: { readonly min: Vec3; readonly max: Vec3 } | null;
  /** The Data sidebar's status line: no points, or a failed build, export or load.
   * `catalogLoaded` clears it, so a stale message cannot outlive a real load. */
  readonly statusMessage: string | null;
};
