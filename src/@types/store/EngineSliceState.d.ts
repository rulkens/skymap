/**
 * EngineSliceState — the shape of the Redux 'engine' slice.
 *
 * Named EngineSliceState to be unmistakable next to the engine's
 * runtime-state bag type (`@types/engine/state/EngineState`), which is a
 * different, much larger thing.
 *
 * Holds the observable runtime state the engine reports to the store:
 * lifecycle status, per-source galaxy counts, per-structure counts, load
 * progress, the current scale-bar descriptor, the focused-body distance, the
 * live HDR display capability, and the two curated metadata sidecars.
 * Each field is written by a single action creator in `engineSlice`; nothing
 * in this type is computed or derived — derivation is the selector's job.
 *
 * `sourceCounts` is a sparse record (Partial) because the engine reports
 * counts one source at a time via `engineSourceCountReported`; not every
 * source is necessarily loaded in every session (tier selection, slow
 * network). `structureCounts` follows the same pattern for structure
 * sources, and `provenanceCounts` follows it a third time for the per-source
 * estimated-value tallies the debug panel's provenance table reads. Using
 * Partial rather than `Record<…, number | undefined>` keeps the type
 * honest: a missing key means "not yet reported", not "zero".
 *
 * `loadProgress` is nullable rather than an optional field because the
 * discriminated presence / absence is meaningful: null means "no fetch in
 * flight right now" and the UI uses it to hide the progress bar. An
 * optional field would be identical at runtime but noisier at the call site
 * (every reader would still need a null-guard anyway).
 */

import type { EngineStatus } from '../engine/EngineStatus';
import type { ScaleInfo } from '../engine/ScaleInfo';
import type { SourceType } from '../data/SourceType';
import type { StructureId } from '../data/structure/StructureId';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { ProvenanceCounts } from '../engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { FamousStarMetaEntry } from '../loading/FamousStarMetaEntry';

export type EngineSliceState = {
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
   * Curated JSON sidecar payloads that the React layer selects — narrative and
   * physical metadata not carried in a catalog's binary rows. Each field is
   * written wholesale by its own asset slot when that sidecar's fetch settles,
   * and is empty both before the slot settles and after a failed fetch, so no
   * field needs a separate "loaded" flag beside its array.
   *
   * Grouping them keeps the qualifier in the key path instead of repeating it
   * through every symbol, and gives the next sidecar a home rather than another
   * flat field on `EngineSliceState`. React-read is the criterion, not
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
