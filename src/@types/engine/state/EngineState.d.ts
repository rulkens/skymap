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
import type { EnginePickingState } from './EnginePickingState';
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
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  /** True once `wireInput` seeded the first real camera pose. The gate every
   * pre-bootstrap bail reads; there is no boot camera object to read from. */
  booted: boolean;
  /** Whether the last frame had a fade or label animation running; `settled()` polls it. */
  fadesAnimating: boolean;
  /**
   * Live camera Resources, seeded with placeholders in `engine.ts` and filled
   * by `wireInput`'s bootstrap seed once the initial camera exists.
   */
  cameraRuntime: CameraRuntime;
  /** Per-`CUBEMAP_CAPTURES`-row bake bookkeeping, written by `scheduleSkyCaptures` / `scheduleProbeCapture`, read by each sky target's `allocateWhen`. */
  cubemapCaptures: CubemapCaptureRuntimes;
  /**
   * Bumped once per successful galaxy-catalog commit (`wireGalaxyCatalogSourceSlot`'s
   * single writer). A scalar, not per-row: it counts catalog content changes, not
   * settings, and is read by `scheduleSkyCaptures`' re-bake key.
   */
  contentVersion: number;
  /**
   * Layers bound to their runtimes by `createLayers`, in tuple order; `[]` until
   * then. `destroy()` tears them down in REVERSE order, before any core teardown
   * a Layer's captured core object depends on.
   */
  layers: readonly LayerInstance[];
  /**
   * Tasks forked for each Layer's `sagas`. `destroy()` cancels them BEFORE tearing
   * down `layers`, so a re-`createEngine` on the same store never has two
   * watchers reacting.
   */
  layerSagaTasks: readonly Task[];
  /**
   * The composed contributions: core's constants then each Layer's, assembled once
   * by `createLayers`. Readers walk these, not `CONTENT_PASSES` / `meshAssetRows`
   * (core's half only). `assetRows` is the companion-expanded fold of both halves;
   * `slotsByKey` indexes each row's slot by key.
   */
  passes: readonly ContentPass[];
  /** `executeFrame` resolves a `'compute'` step's name against this; an absent
   * name drops rather than throws, mirroring a `FRAME_ORDER` name no present
   * Layer owns. */
  computes: readonly ContentCompute[];
  /** `runPlanSteps` resolves a `'plan'` step's name against this; `checkFrameOrder`
   * asserts every row here is named on exactly one `plan` line, in a section
   * of the same scope — unlike `computes`, a `plan` line naming nothing here throws. */
  planners: readonly FrameContentPlanner<unknown>[];
  assetRows: readonly AssetWiringRow[];
  /** Every Layer's `slabs`, composed once by `createLayers`;
   * `deriveFrameContext` folds the band-open ones in beside core's own hostless-mesh-body rows. */
  slabRows: readonly SlabRow[];
  /** Every Layer's `visibility`, in composition order, composed once by `createLayers`:
   * the entries the fade targets are seeded, recomputed and resolved from. */
  visibilityEntries: readonly VisibilityEntry[];
  /** The slot behind every gated fade identity, collected once by `wireSlots`. */
  visibilityGates: VisibilityGates;
  slotsByKey: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;
  /** Every Layer's `worldLabels`, in composition order, composed once by
   * `createLayers`; `runLabel3DProducers` walks this. */
  label3DProducers: readonly Label3DProducer[];
  /** Core's conics group then every Layer's `guides.orbitTrails` group, each with its fade
   * bound, composed once by `createLayers`; `orbitTrailsPass` walks this. */
  orbitTrailGroups: readonly GatedOrbitTrailGroup[];
  /** `FLAT_TERRAIN` until `createLayers` folds core's provider and every Layer's. */
  terrain: LayerTerrain;
  /**
   * Core's selection rows plus each Layer's, appended once by `createLayers`:
   * the composed resolver's dispatch table. Unrelated to `selectionRows`
   * above, the saga-reconciled display cache.
   */
  selectionKindRows: readonly SelectionKindRow[];
  /** Every Layer's static `targets`, in tuple order — seeded by `createEngine`, read by the
   * `renderTargets` GPU-handle row, which runs before `createLayers`. */
  readonly layerTargets: readonly (readonly RenderTargetSpec[])[];
};
