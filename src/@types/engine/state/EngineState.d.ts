/**
 * EngineState — every mutable runtime value the engine owns, grouped by
 * concern. Shape only, no behaviour: the factory lives in `engine.ts`'s closure
 * (it needs the device / canvas / callbacks), and initial values come from
 * `data/defaults.ts`. Fields are mutated IN PLACE — per-frame writes and the
 * handle setters run inside the rAF loop, where an immutable spread would
 * allocate two objects per slider drag.
 */

import type { Task } from 'redux-saga';
import type { Tier } from '../../data/Tier';
import type { ViewRigKey } from '../frame/ViewRigKey';
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
import type { ContentCompute } from '../frame/ContentCompute';
import type { FrameContentPlanner } from '../frame/FrameContentPlanner';
import type { AssetKey } from '../../loading/AssetKey';
import type { AssetSlot } from '../../loading/AssetSlot';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { SlabRow } from '../frame/SlabRow';
import type { VisibilityEntry } from '../layer/VisibilityEntry';
import type { VisibilityGates } from './VisibilityGates';
import type { SelectionKindRow } from '../layer/SelectionKindRow';
import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { LayerTerrain } from '../layer/LayerTerrain';
import type { GatedOrbitTrailGroup } from '../frame/GatedOrbitTrailGroup';
import type { RenderTargetSpec } from '../frame/RenderTargetSpec';
import type { UiState } from '../../ui/UiState';

export type EngineState = {
  settings: EngineSettingsState;
  /** A getter onto `store.getState().tier` — no engine-side mirror to drift. */
  tier: Tier;
  /** Which `ViewRig` (`VIEW_RIGS`) `renderFrame` walks this frame. Seeded `'mono'`. */
  viewRig: ViewRigKey;
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
  /** Whether the last frame had a fade or label animation running; `settled()` polls it. */
  fadesAnimating: boolean;
  /** Seeded with placeholders in `engine.ts`, filled by `wireInput`'s bootstrap seed. */
  cameraRuntime: CameraRuntime;
  /** Per-`CUBEMAP_CAPTURES`-row bake bookkeeping, written by `scheduleSkyCaptures` / `scheduleProbeCapture`, read by each sky row's `allocateWhen`. */
  cubemapCaptures: CubemapCaptureRuntimes;
  /** Bumped per galaxy-catalog commit (`wireGalaxyCatalogSourceSlot` is the sole writer); `scheduleSkyCaptures`' re-bake key. */
  contentVersion: number;
  assetSlots: EngineAssetSlots;
  /** Bound by `createLayers` in composition order; `destroy()` tears them down in REVERSE, before any core teardown they depend on. */
  layers: readonly LayerInstance[];
  /** Forked per Layer `sagas`; `destroy()` cancels them BEFORE `layers`, so a re-`createEngine` on the same store never doubles watchers. */
  layerSagaTasks: readonly Task[];
  /**
   * Composed once by `createLayers` (core's constants, then each Layer's). Runtime readers
   * walk these, not `CONTENT_PASSES` / `CORE_COMPUTES` / `ASSET_WIRING` (core's halves only).
   */
  passes: readonly ContentPass[];
  /** `executeFrame` resolves a `'compute'` step's name here; an absent name drops rather than throws. */
  computes: readonly ContentCompute[];
  /** `runPlanSteps` resolves a `'plan'` step's name here; unlike `computes`, a `plan` line naming nothing throws. */
  planners: readonly FrameContentPlanner<unknown>[];
  /** Companion-expanded fold over core's and every Layer's asset rows. */
  assetRows: readonly AssetWiringRow[];
  /** `deriveFrameContext` folds the band-open ones in beside the store's own rows. */
  slabRows: readonly SlabRow[];
  /** The entries the fade targets are seeded, recomputed and resolved from. */
  visibilityEntries: readonly VisibilityEntry[];
  /** The slot behind every gated fade identity, collected once by `wireSlots`. */
  visibilityGates: VisibilityGates;
  /** Slots minted by Layer asset-row factories, consulted by `slotFor` ahead of core's own. */
  layerSlots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;
  label3DProducers: readonly Label3DProducer[];
  /** Core's conics group then every Layer's `guides.orbitTrails` group, each with its fade bound. */
  orbitTrailGroups: readonly GatedOrbitTrailGroup[];
  /** `FLAT_TERRAIN` until `createLayers` folds core's provider and every Layer's. */
  terrain: LayerTerrain;
  /** The composed resolver's dispatch table; NOT the saga display cache `selectionRows` above. */
  selectionKindRows: readonly SelectionKindRow[];
  /** Seeded by `createEngine` because the `renderTargets` GPU-handle row runs before `createLayers`. */
  readonly layerTargets: readonly (readonly RenderTargetSpec[])[];
};
