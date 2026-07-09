/**
 * EngineSliceState — the shape of the Redux 'engine' slice.
 *
 * Named EngineSliceState to be unmistakable next to the engine's
 * runtime-state bag type (`@types/engine/state/EngineState`), which is a
 * different, much larger thing.
 *
 * Holds the observable runtime state the engine reports to the store:
 * lifecycle status, per-source galaxy counts, per-structure counts, load
 * progress, and the current scale-bar descriptor. Each field is written
 * by a single action creator in `engineSlice`; nothing in this type is
 * computed or derived — derivation is the selector's job.
 *
 * `sourceCounts` is a sparse record (Partial) because the engine reports
 * counts one source at a time via `engineSourceCountReported`; not every
 * source is necessarily loaded in every session (tier selection, slow
 * network). `structureCounts` follows the same pattern for structure
 * sources. Using Partial rather than `Record<…, number | undefined>` keeps
 * the type honest: a missing key means "not yet reported", not "zero".
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

export type EngineSliceState = {
  status: EngineStatus;
  scale: ScaleInfo;
  sourceCounts: Partial<Record<SourceType, number>>;
  structureCounts: Partial<Record<StructureId, number>>;
  loadProgress: LoadProgressState | null;
};
