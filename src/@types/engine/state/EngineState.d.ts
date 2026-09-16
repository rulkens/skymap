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
import type { CameraRuntime } from './CameraRuntime';
import type { CubemapCaptureRuntimes } from './CubemapCaptureRuntimes';
import type { SelectionState } from '../../store/SelectionState';
import type { SelectionRowsState } from '../../store/SelectionRowsState';
import type { LayerInstance } from '../layer/LayerInstance';
import type { ContentPass } from '../frame/ContentPass';
import type { AssetKey } from '../../loading/AssetKey';
import type { AssetSlot } from '../../loading/AssetSlot';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { SelectionKindRow } from '../layer/SelectionKindRow';
import type { UiState } from '../../ui/UiState';

export type EngineState = {
  settings: EngineSettingsState;
  /** A getter onto `store.getState().tier` — no engine-side mirror to drift. */
  tier: Tier;
  /** A getter onto `store.getState().selection`; the pick path dispatches the writes. */
  selection: SelectionState;
  /** A getter onto `store.getState().selectionRows` — the saga-reconciled display rows. */
  selectionRows: SelectionRowsState;
  /** A getter onto `store.getState().ui`, the same shape as `selection` above. */
  ui: UiState;
  /** Per-type data stores — the authoritative app-side home for each. See `EngineData`. */
  data: EngineData;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  /** True once `wireInput` seeded the first real camera pose. The gate every
   * pre-bootstrap bail reads; there is no boot camera object to read from. */
  booted: boolean;
  /**
   * Live camera Resources, seeded with placeholders in `engine.ts` and filled
   * by `wireInput`'s bootstrap seed once the initial camera exists.
   */
  cameraRuntime: CameraRuntime;
  /**
   * Per-`CUBEMAP_CAPTURES`-row bake bookkeeping — render state, not camera
   * state; written by `scheduleSkyCaptures` and `scheduleProbeCapture`, read
   * by each sky row's target's `allocateWhen`. Seeded in `engine.ts`; entries
   * are mutated in place.
   */
  cubemapCaptures: CubemapCaptureRuntimes;
  /**
   * Bumped once per successful galaxy-catalog commit (`wireGalaxyCatalogSourceSlot`'s
   * single writer). A scalar, not per-row: it counts catalog content changes, not
   * settings, and is read by `scheduleSkyCaptures`' re-bake key.
   */
  contentVersion: number;
  assetSlots: EngineAssetSlots;
  /**
   * Every Layer bound to its runtime by `createLayers`, in composition tuple
   * order. `[]` until that phase runs; `destroy()` tears these down in
   * REVERSE order before any core teardown a Layer's captured core object
   * depends on (D8).
   */
  layers: readonly LayerInstance[];
  /**
   * The composed contributions: core's constants followed by each Layer's, in
   * tuple order, assembled once by `createLayers`. Every runtime reader walks
   * these rather than `CONTENT_PASSES` / `ASSET_WIRING` / `FADE_LAYERS`, which
   * are core's authored halves only. `assetRows` is the COMPANION-EXPANDED
   * fold over both halves; `layerSlots` holds the slot each Layer asset row's
   * factory minted, consulted by `slotFor` ahead of core's own homes.
   */
  passes: readonly ContentPass[];
  assetRows: readonly AssetWiringRow[];
  fadeRows: readonly FadeLayer<unknown>[];
  layerSlots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;
  /**
   * The one selection-row array core owns (D5, Ruling 4): `[]` here,
   * populated by Task 8's core rows and appended to once, by `createLayers`,
   * with each Layer's own rows. Named distinctly from `selectionRows` above —
   * that field is the UNRELATED saga-reconciled display cache
   * (`SelectionRowsState`); this one holds `SelectionKindRow`s, the composed
   * resolver's dispatch table.
   */
  selectionKindRows: readonly SelectionKindRow[];
};
