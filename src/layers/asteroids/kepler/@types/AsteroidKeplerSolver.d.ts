/**
 * AsteroidKeplerSolver — the catalog's GPU rows and the compute that writes every row's heliocentric
 * position into `helio`. `rows()` is null until a catalog is uploaded and after `clear`.
 */
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { AsteroidKeplerRows } from './AsteroidKeplerRows';

export type AsteroidKeplerSolver = Renderer & {
  upload(catalog: AsteroidCatalog): void;
  clear(): void;
  rows(): AsteroidKeplerRows | null;
  /** Solves every row at `simJd` (TT); encodes nothing without rows. */
  encode(encoder: GPUCommandEncoder, simJd: number, claim: ClaimTimestampWrites): void;
};
