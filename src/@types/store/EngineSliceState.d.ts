/**
 * EngineSliceState — the shape of the Redux 'engine' slice.
 *
 * Named EngineSliceState to be unmistakable next to the engine's
 * runtime-state bag type (`@types/engine/state/EngineState`), which is a
 * different, much larger thing.
 *
 * Holds the observable runtime state the engine reports to the store:
 * lifecycle status, per-source galaxy counts, per-structure counts, load
 * progress, the current scale-bar descriptor, the focused-body distance, and
 * the two curated metadata sidecars.
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
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
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
  sourceCounts: Partial<Record<SourceType, number>>;
  structureCounts: Partial<Record<StructureId, number>>;
  provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
  loadProgress: LoadProgressState | null;
  /**
   * Famous-galaxy narrative metadata (`famous_meta.json`), written wholesale by
   * `engineFamousMetaReported` when the sidecar's asset slot settles. Empty
   * until then, and empty again if the fetch failed — the command palette lists
   * whatever entries it is handed, so an absent sidecar needs no separate
   * "loaded" flag beside the array.
   */
  famousMeta: readonly FamousMetaEntry[];
  /**
   * Famous-star narrative/physical metadata (`famous_stars_meta.json`), on the
   * same contract as `famousMeta` above: written wholesale by
   * `engineFamousStarsMetaReported`, empty both before the slot settles and
   * after a failed fetch, which is the InfoCard's headline-alone path.
   */
  famousStarsMeta: readonly FamousStarMetaEntry[];
};
