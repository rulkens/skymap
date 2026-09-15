/**
 * CoreEngineSliceState — the shape of the Redux 'engine' slice's core fields.
 * `EngineSliceState` widens this with each Layer's published facts.
 *
 * `sourceCounts`/`structureCounts`/`provenanceCounts` are sparse (Partial)
 * because the engine reports them one source/structure at a time; a missing
 * key means "not yet reported", not "zero".
 */

import type { EngineStatus } from '../engine/EngineStatus';
import type { ScaleInfo } from '../engine/ScaleInfo';
import type { SourceType } from '../data/SourceType';
import type { StructureId } from '../data/structure/StructureId';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { ProvenanceCounts } from '../engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { FamousStarMetaEntry } from '../loading/FamousStarMetaEntry';
import type { StructureSearchEntry } from '../engine/StructureSearchEntry';

export type CoreEngineSliceState = {
  status: EngineStatus;
  scale: ScaleInfo;
  /**
   * Live distance (Mpc) from the camera to the focused scene body, or null
   * when no body is focused. Written by `engineBodyDistanceReported`,
   * dispatched a few Hz (not per-frame) behind a `throttleByTime` gate, with
   * dedup-on-write so a stable distance does not re-fire the InfoCard
   * subscriber.
   */
  focusedBodyDistanceMpc: number | null;
  /**
   * True when the ACTIVE display currently reports more than SDR range (the
   * CSS Media Queries Level 5 `dynamic-range` feature). Written by
   * `engineHdrCapabilityChanged`: once at boot with `GpuContext.hdrCapable`,
   * and again on every later `matchMedia` `change` — see `device.ts`'s
   * `watchHdrCapability`. NOT whether the swap chain currently is the
   * extended-range surface; that's `hdrActiveOf`, derived from the render
   * targets' live format.
   */
  hdrCapable: boolean;
  sourceCounts: Partial<Record<SourceType, number>>;
  structureCounts: Partial<Record<StructureId, number>>;
  provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
  loadProgress: LoadProgressState | null;
  /**
   * The command palette's structure search index — every loaded structure
   * (anchors + bulk) projected down to its lean searchable fields. Published
   * by `wireStructureProjection` alongside `engineStructureCountsChanged`, on
   * the same boot + group-change schedule, so a Cmd+K opened before any
   * catalog lands still gets the anchor set.
   */
  structureSearchList: readonly StructureSearchEntry[];
  /**
   * Curated JSON sidecar payloads that the React layer selects — narrative and
   * physical metadata not carried in a catalog's binary rows. Each field is
   * written wholesale by its own asset slot when that sidecar's fetch settles,
   * and is empty both before the slot settles and after a failed fetch, so no
   * field needs a separate "loaded" flag beside its array.
   *
   * Grouping them keeps the qualifier in the key path instead of repeating it
   * through every symbol, and gives the next sidecar a home rather than another
   * flat field on `CoreEngineSliceState`. React-read is the criterion, not
   * curated-ness: `structures_meta.json` is a curated sidecar too, but the
   * engine is what consumes it, so its payload lives in `structureStore`.
   */
  meta: {
    /**
     * Famous-galaxy narrative metadata (`famous_galaxies_meta.json`), written wholesale by
     * `engineFamousGalaxiesMetaReported` when the sidecar's asset slot settles.
     * Empty until then, and empty again if the fetch failed — the command palette
     * lists whatever entries it is handed, so an absent sidecar needs no separate
     * "loaded" flag beside the array.
     */
    readonly famousGalaxies: readonly FamousGalaxyMetaEntry[];
    /**
     * Famous-star narrative/physical metadata (`famous_stars_meta.json`), on the
     * same contract as `famousGalaxies` above: written wholesale by
     * `engineFamousStarsMetaReported`, empty both before the slot settles and
     * after a failed fetch, which is the InfoCard's headline-alone path.
     */
    readonly famousStars: readonly FamousStarMetaEntry[];
  };
};
