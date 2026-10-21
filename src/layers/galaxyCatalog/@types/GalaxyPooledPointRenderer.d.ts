/**
 * The pooled (octree) galaxy point renderer: a source's index records and chunk pool as
 * 24-byte records, drawn through the shared GPU cut (`createGalaxyPooledPointRenderer`).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyPointStats } from '../../../@types/engine/GalaxyPointStats';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { GalaxyCatalogSettings } from '../../../@types/settings/GalaxyCatalogSettings';
import type { GalaxyBlobTuningKey } from './GalaxyBlobTuningKey';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeCutInputs } from '../../../@types/octree/OctreeCutInputs';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { OctreePoolShape } from '../../../@types/octree/OctreePoolShape';
import type { GalaxyPointDrawSettings } from '../../../@types/rendering/GalaxyPointDrawSettings';
import type { GalaxyPooledPickLayouts } from '../../../@types/rendering/GalaxyPooledPickLayouts';
import type { PooledPickSourceDraw } from '../../../@types/rendering/PooledPickSourceDraw';

export type GalaxyPooledPointRenderer = Omit<
  OctreePoolHost<GalaxyColumns>['renderer'],
  'upload'
> & {
  readonly label: string;
  readonly pickLayouts: GalaxyPooledPickLayouts;
  /** `OctreePoolHost`'s upload plus the catalog stats the record pack reads; the slot adapts it. */
  upload(
    source: SourceType,
    octree: Octree<GalaxyColumns>,
    slots: number,
    stats: GalaxyPointStats,
  ): OctreePoolShape;
  /** Free the source's pool and cut. */
  unload(source: SourceType): void;
  /** Pin the slot table a pick readback resolves against: the one its draw saw. */
  snapshotPickSlots(): void;
  /** Pool index (a pick's) → catalog ordinal, through the pick snapshot; null when not resolvable. */
  recordOrdinal(source: SourceType, poolIndex: number): number | null;
  /** Catalog ordinal → pool index through the live slots; null when its chunk is not resident. */
  poolRecordIndex(source: SourceType, ordinal: number): number | null;
  /** This frame's cut inputs (or none), and whether the cut is re-taken or only re-uniformed. */
  setFrameCut(inputs: OctreeCutInputs | null, recut: boolean): void;
  encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void;
  /** Both streams of every frame-cut source, each faded by its own source; a capture face reads the capture cut. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
    capture: boolean,
    blob: Pick<GalaxyCatalogSettings, GalaxyBlobTuningKey>,
  ): void;
  /** The live leaf draws of the frame-cut sources `include` keeps (blobs are not galaxies). */
  pickDraws(include: (source: SourceType) => boolean): PooledPickSourceDraw[];
  destroy(): void;
};
