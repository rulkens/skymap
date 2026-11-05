/**
 * The pooled (octree) galaxy point renderer: a source's index records and chunk pool as
 * 24-byte records, drawn through the shared GPU cut (`createGalaxyPooledPointRenderer`).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';
import type { GalaxyColumns } from '../../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyPointStats } from '../../pointSprites/@types/GalaxyPointStats';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { GalaxyCatalogSettings } from '../../@types/GalaxyCatalogSettings';
import type { GalaxyBlobTuningKey } from '../../controls/@types/GalaxyBlobTuningKey';
import type { Octree } from '../../../../@types/octree/Octree';
import type { OctreeCutInputs } from '../../../../@types/octree/OctreeCutInputs';
import type { OctreeDrawStream } from '../../../../@types/octree/OctreeDrawStream';
import type { OctreePoolHost } from '../../../../@types/octree/OctreePoolHost';
import type { OctreePoolShape } from '../../../../@types/octree/OctreePoolShape';
import type { GalaxyPointDrawSettings } from '../../pointSprites/@types/GalaxyPointDrawSettings';
import type { GalaxyPooledPickLayouts } from './GalaxyPooledPickLayouts';
import type { PooledPickSourceDraw } from './PooledPickSourceDraw';

export type GalaxyPooledPointRenderer = Omit<
  OctreePoolHost<GalaxyColumns>['renderer'],
  'upload'
> & {
  readonly label: string;
  readonly pickLayouts: GalaxyPooledPickLayouts;
  /** `OctreePoolHost`'s upload plus the catalog stats the record pack reads; the slot adapts it. */
  upload(
    source: GalaxyCatalogSourceType,
    octree: Octree<GalaxyColumns>,
    pool: OctreePoolShape,
    stats: GalaxyPointStats,
  ): void;
  /** Free the source's pool and cut. */
  unload(source: GalaxyCatalogSourceType): void;
  /** Pin the slot table a pick readback resolves against: the one its draw saw. */
  snapshotPickSlots(): void;
  /** Pool index (a pick's) → catalog ordinal, through the pick snapshot; null when not resolvable. */
  recordOrdinal(source: GalaxyCatalogSourceType, poolIndex: number): number | null;
  /** Catalog ordinal → pool index through the live slots; null when its chunk is not resident. */
  poolRecordIndex(source: GalaxyCatalogSourceType, ordinal: number): number | null;
  /** This frame's cut inputs (or none), and whether the cut is re-taken or only re-uniformed. */
  setFrameCut(inputs: OctreeCutInputs | null, recut: boolean): void;
  encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void;
  /** One stream of every frame-cut source, each faded by its own source; a capture face reads the capture cut. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
    capture: boolean,
    stream: OctreeDrawStream,
    blob: Pick<GalaxyCatalogSettings, GalaxyBlobTuningKey>,
  ): void;
  /** The live leaf draws of the frame-cut sources `include` keeps (blobs are not galaxies). */
  pickDraws(include: (source: GalaxyCatalogSourceType) => boolean): PooledPickSourceDraw[];
  destroy(): void;
};
