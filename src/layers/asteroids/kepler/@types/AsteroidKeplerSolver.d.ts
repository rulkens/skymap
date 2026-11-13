/**
 * AsteroidKeplerSolver — the catalog's GPU rows and the compute that solves every row and lists the
 * dots that show into `visible`. `rows()` is null until a catalog is uploaded and after `clear`.
 */
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { AsteroidKeplerRows } from './AsteroidKeplerRows';
import type { AsteroidKeplerFrame } from './AsteroidKeplerFrame';

export type AsteroidKeplerSolver = Renderer & {
  upload(catalog: AsteroidCatalog): void;
  clear(): void;
  rows(): AsteroidKeplerRows | null;
  /** Solves and culls every row for `frame`; encodes nothing without rows. */
  encode(encoder: GPUCommandEncoder, frame: AsteroidKeplerFrame, claim: ClaimTimestampWrites): void;
};
