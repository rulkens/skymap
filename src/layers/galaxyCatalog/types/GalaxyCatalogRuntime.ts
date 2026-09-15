/**
 * The galaxy family's whole runtime: what `state.gpu.*`, `state.subsystems.*`,
 * `state.assetSlots.*` and `state.data.galaxies` used to hold, as plain fields
 * every contribution closes over. Non-null throughout — `create` builds each
 * before returning, so nothing re-checks a handle core had to leave nullable.
 */

import type { GalaxyCatalogBridge } from '../../../@types/engine/layer/GalaxyCatalogBridge';
import type { BiasMode } from '../../../@types/data/galaxyCatalog/BiasMode';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FamousGalaxiesPayload } from '../../../@types/loading/FamousGalaxiesPayload';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { HiResFamousReq } from '../../../@types/loading/HiResFamousReq';
import type { HiResFamousPair } from '../../../@types/engine/subsystems/HiResFamousPair';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { ProceduralDiskSubsystem } from '../../../@types/engine/subsystems/ProceduralDiskSubsystem';
import type { TexturedDiskSubsystem } from '../../../@types/engine/subsystems/TexturedDiskSubsystem';
import type { DiskPlannerWalk } from '../../../@types/engine/subsystems/DiskPlannerWalk';
import type { BiasCorrectionSubsystem } from '../../../@types/engine/subsystems/BiasCorrectionSubsystem';
import type { GalaxyPointRenderer } from '../../../@types/rendering/GalaxyPointRenderer';
import type { GalaxyPickRenderer } from '../../../@types/rendering/GalaxyPickRenderer';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../../@types/rendering/ProceduralDiskRenderer';
import type { DiskRadiusRing } from '../../../@types/rendering/DiskRadiusRing';

export type GalaxyCatalogRuntime = GalaxyCatalogBridge & {
  /** The CPU-side catalog mirror; the point slots' commits are its only writers. */
  readonly catalogs: Map<SourceType, GalaxyCatalog>;
  /** A getter over the meta slot's private cell, so the runtime literal is complete in one expression. */
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  /** Per-source tally; published as a copy beside each source-count pulse (Ruling 12). */
  readonly provenanceCounts: Map<SourceType, ProvenanceCounts>;

  readonly points: ReadonlyMap<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  readonly famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq>;
  readonly hiResFamous: AssetSlot<HiResFamousPair, HiResFamousReq>;

  readonly pointRenderer: GalaxyPointRenderer;
  readonly pickRenderer: GalaxyPickRenderer;
  readonly texturedDiskRenderer: TexturedDiskRenderer;
  readonly proceduralDiskRenderer: ProceduralDiskRenderer;
  readonly diskRadiusRing: DiskRadiusRing;

  readonly galaxyAtlas: BitmapStreamSubsystem;
  readonly texturedDisks: TexturedDiskSubsystem;
  readonly proceduralDisks: ProceduralDiskSubsystem;
  readonly diskPlannerWalk: DiskPlannerWalk;
  readonly biasCorrection: BiasCorrectionSubsystem;
  /** The bias mode the last bake was fired for; `frame` reconciles it against settings. */
  biasLastApplied: BiasMode;
};
