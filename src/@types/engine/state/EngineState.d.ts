/**
 * EngineState — every mutable runtime value the engine owns, grouped by
 * concern. Shape only, no behaviour: the factory lives in `engine.ts`'s closure
 * (it needs the device / canvas / callbacks), and initial values come from
 * `data/defaults.ts`. Fields are mutated IN PLACE — per-frame writes and the
 * handle setters run inside the rAF loop, where an immutable spread would
 * allocate two objects per slider drag.
 */

import type { Tier } from '../../data/Tier';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { EngineData } from '../data/EngineData';
import type { EnginePickingState } from './EnginePickingState';
import type { EngineAssetSlots } from './EngineAssetSlots';
import type { EngineGpuHandles } from '../handles/EngineGpuHandles';
import type { EngineSubsystemHandles } from '../handles/EngineSubsystemHandles';
import type { createOrbitCamera } from '../../../utils/camera/createOrbitCamera';
import type { RequestKey } from '../../loading/RequestKey';
import type { CameraRuntime } from './CameraRuntime';
import type { SelectionState } from '../../store/SelectionState';
import type { SelectionRowsState } from '../../store/SelectionRowsState';
import type { FamousGalaxyMetaEntry } from '../../loading/FamousGalaxyMetaEntry';

export type EngineState = {
  settings: EngineSettingsState;
  /** A getter onto `store.getState().tier` — no engine-side mirror to drift. */
  tier: Tier;
  /** A getter onto `store.getState().selection`; the pick path dispatches the writes. */
  selection: SelectionState;
  /** A getter onto `store.getState().selectionRows` — the saga-reconciled display rows. */
  selectionRows: SelectionRowsState;
  /** A getter onto `store.getState().engine.meta.famousGalaxies`. */
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
  /** Per-type data stores — the authoritative app-side home for each. See `EngineData`. */
  data: EngineData;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  /** The boot framing camera; non-null once `wireInput` ran. */
  cam: ReturnType<typeof createOrbitCamera> | null;
  /**
   * Live camera Resources, seeded with placeholders in `engine.ts` and filled
   * by `wireInput`'s bootstrap seed once the initial camera exists.
   */
  cameraRuntime: CameraRuntime;
  assetSlots: EngineAssetSlots;
  /**
   * One-shot transient request flags read by demand predicates via
   * `DemandCtx.request(k)`. A flag is set and left set: the demand loop's
   * idle-guard keeps the triggered slot from re-fetching, so no clear-on-ready
   * is needed.
   */
  requests: Set<RequestKey>;
};
