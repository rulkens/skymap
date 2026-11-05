/**
 * The galaxy family's whole runtime — renderers, subsystems, slots and catalogs
 * as plain fields every contribution closes over. Non-null throughout: `create`
 * builds each one before returning, so no reader re-checks a handle.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from './GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../records/@types/GalaxyRecordSource';
import type { GalaxyCatalogFacts } from './GalaxyCatalogFacts';
import type { GalaxyRecordBridge } from '../selection/@types/GalaxyRecordBridge';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FamousGalaxiesPayload } from '../famousGalaxies/@types/FamousGalaxiesPayload';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { HiResFamousReq } from '../hiResFamous/@types/HiResFamousReq';
import type { HiResFamousPair } from '../hiResFamous/@types/HiResFamousPair';
import type { PgcAliasMap } from '../aliases/@types/PgcAliasMap';
import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem';
import type { TextureAtlas } from '../../../services/gpu/resources/textureAtlas';
import type { ProceduralDiskSubsystem } from '../disks/procedural/@types/ProceduralDiskSubsystem';
import type { TexturedDiskSubsystem } from '../disks/textured/@types/TexturedDiskSubsystem';
import type { DiskPlannerWalk } from '../lod/@types/DiskPlannerWalk';
import type { GalaxyPointRenderer } from '../pointSprites/@types/GalaxyPointRenderer';
import type { GalaxyPickRenderer } from '../pointSprites/@types/GalaxyPickRenderer';
import type { TexturedDiskRenderer } from '../disks/textured/@types/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../disks/procedural/@types/ProceduralDiskRenderer';
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyOctreeReq } from '../octree/@types/GalaxyOctreeReq';
import type { OctreeChunkStream } from '../../../@types/octree/OctreeChunkStream';
import type { GalaxyOctreePayload } from '../octree/@types/GalaxyOctreePayload';
import type { GalaxyPooledPointRenderer } from '../octree/@types/GalaxyPooledPointRenderer';

export type GalaxyCatalogRuntime = {
  /** The CPU-side catalog mirror, kept for the flat-only readers (hi-res famous, famous labels). */
  readonly catalogs: Map<SourceType, GalaxyCatalog>;
  /** One record source per loaded catalog, set and deleted with `catalogs`; every other reader's view. */
  readonly records: ReadonlyMap<GalaxyCatalogSourceType, GalaxyRecordSource>;
  /** The records' lookups made synchronous for the selection row. */
  readonly recordBridge: GalaxyRecordBridge;
  /** The lazy PGC → human-name alias fetch slot; the pgcAlias asset row's factory hands this back. */
  readonly pgcAlias: AssetSlot<PgcAliasMap, void>;
  /** A getter over the meta slot's private cell, so the runtime literal is complete in one expression. */
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  /** Bumped by every point-slot commit; the two `frame` reconciles key on it. */
  readonly catalogsVersion: number;
  /** Bumped by the planner when an octree chunk lands or leaves: the resident records changed. */
  residencyVersion: number;
  /** Captured at `create` the way the pick renderer captures it (see the comment in `create.ts` on why that is safe): passes read the engine's `@group(3)` focus group here, not off `state.gpu`. */
  readonly focusBindGroup: GPUBindGroup;
  /** Captured from `create`'s deps: `Layer.frame` hands `frame` only the runtime, never `deps`. */
  readonly publish: (patch: Partial<GalaxyCatalogFacts>) => void;

  readonly points: ReadonlyMap<GalaxyCatalogSourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  /** One slot per source that ships an octree; demanded instead of its point slot when its format is `octree`. */
  readonly octreePoints: ReadonlyMap<
    GalaxyCatalogSourceType,
    AssetSlot<GalaxyOctreePayload, GalaxyOctreeReq>
  >;
  /** A source's chunk stream while its committed index names chunks; the octree slot fills and clears it. */
  readonly chunkStreams: Map<SourceType, OctreeChunkStream<GalaxyColumns>>;
  readonly famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq>;
  readonly hiResFamous: AssetSlot<HiResFamousPair, HiResFamousReq>;

  readonly pointRenderer: GalaxyPointRenderer;
  readonly pooledPointRenderer: GalaxyPooledPointRenderer;
  readonly pickRenderer: GalaxyPickRenderer;
  readonly texturedDiskRenderer: TexturedDiskRenderer;
  readonly proceduralDiskRenderer: ProceduralDiskRenderer;

  readonly galaxyAtlas: TileStreamSubsystem<ImageBitmap, TextureAtlas>;
  readonly texturedDisks: TexturedDiskSubsystem;
  readonly proceduralDisks: ProceduralDiskSubsystem;
  readonly diskPlannerWalk: DiskPlannerWalk;
};
