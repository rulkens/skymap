/**
 * CoreEngineSliceState — the shape of the Redux 'engine' slice's core fields.
 * `EngineSliceState` widens this with each Layer's published facts.
 *
 * `sourceCounts`/`structureCounts` are sparse (Partial)
 * because the engine reports them one source/structure at a time; a missing
 * key means "not yet reported", not "zero".
 */

import type { EngineStatus } from '../engine/EngineStatus';
import type { ScaleInfo } from '../engine/ScaleInfo';
import type { SourceType } from '../data/SourceType';
import type { StructureId } from '../data/structure/StructureId';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { StructureSearchEntry } from '../engine/StructureSearchEntry';
import type { LayerSearchEntry } from '../engine/layer/LayerSearchEntry';

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
   * Palette rows published by each Layer's `search` feed, keyed by Layer name
   * — a whole-snapshot replace per yield, so a Layer that clears its rows
   * yields an empty array rather than deleting a key. `selectLayerSearchRows`
   * flattens it for the ranker.
   */
  layerSearch: Record<string, readonly LayerSearchEntry[]>;
};
