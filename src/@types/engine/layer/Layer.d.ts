/**
 * Layer — one self-contained slice of the scene: static contributions as plain data,
 * runtime-bound ones as closures over the private `Runtime` its own `create` mints
 * (opaque to core, which only hands it back to the same Layer's methods). The trailing
 * type parameters default to their erased bounds — `Facts` included — so
 * `Layer<string, unknown>` still satisfies the composition constraint.
 */

import type { Slice } from '@reduxjs/toolkit';
import type { RenderTargetSpec } from '../frame/RenderTargetSpec';
import type { ContentPass } from '../frame/ContentPass';
import type { ContentCompute } from '../frame/ContentCompute';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { Exhibit } from '../../exhibits/Exhibit';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { SourceType } from '../../data/SourceType';
import type { SourceEntry } from '../../data/SourceEntry';
import type { LayerTerrain } from './LayerTerrain';
import type { FrameContentPlanner } from '../frame/FrameContentPlanner';
import type { SlabRow } from '../frame/SlabRow';
import type { LayerCoreDeps } from './LayerCoreDeps';
import type { LayerBody } from './LayerBody';
import type { LayerGuides } from './LayerGuides';
import type { LayerSearchEntry } from './LayerSearchEntry';
import type { LayerUiEntry } from './LayerUiEntry';
import type { SagaFactory } from './SagaFactory';
import type { SelectionKindRow } from './SelectionKindRow';
import type { SourceCountReport } from './SourceCountReport';
import type { VisibilityEntry } from './VisibilityEntry';

export type Layer<
  Name extends string,
  Runtime,
  Settings extends readonly Slice[] = readonly Slice[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly (readonly [
    SourceType,
    SourceEntry,
  ])[],
  Facts = unknown,
> = {
  /** Unique across the composition; also the key this Layer's `facts` sit under in `state.engine`. */
  readonly name: Name;

  /** Folded into the app's slice list by `appSettingsSlices`. Absent = no knobs. */
  readonly settings?: Settings;

  // Static contributions: plain data, readable without booting anything.
  /** Appended after core's `renderTargetRows` by the `renderTargets` GPU-handle
   * row (`composeRenderTargetRows`); ids are globally unique — a duplicate
   * throws at boot. */
  readonly targets?: readonly RenderTargetSpec[];
  /** Each runs as its own root task via `createLayers`, cancelled at teardown — not
   * folded into `rootSaga`. Factories, not running sagas. */
  readonly sagas?: readonly SagaFactory[];
  /** Candidate `body-m` slab rows, composed across Layers into `state.slabRows`.
   * `anchorId`s are globally unique and the composed total must fit
   * `LAYER_SLAB_ROW_HEADROOM` — both throw at boot. */
  readonly slabs?: readonly SlabRow[];
  /** Exhibit rows, folded after core's into `APP_EXHIBITS` by import (`appExhibits`); the
   * engine reads them here for their sections' camera rows. Ids unique, asserted at import. */
  readonly exhibits?: readonly Exhibit[];
  /** Typing only: `data/sources.ts` folds the same rows into `SOURCE_REGISTRY` by import. */
  readonly sources?: Sources;
  /** Typing only: `data/bodies/layerBodyRows.ts` folds the same rows into the body tables by import. */
  readonly bodies?: readonly LayerBody[];
  /** Seeded into `state.engine[name]` by `createLayers`; const-inferred, read back via `FactsOf`. */
  readonly facts?: Facts;
  /** Contributions to the `LayerUiSlots`: whole sections (`main` in SettingsPanel,
   * `debug` in DebugPanel), a detail card, or a `labelsAndGuides` toggle row, which
   * `selectToggleRows` appends after the label-category rows in composition order. */
  readonly ui?: readonly LayerUiEntry[];
  /** What this Layer can show and label. The address types derive from `APP_VISIBILITY`,
   * which imports the same tuple from the Layer's `visibility.ts`, never from here. */
  readonly visibility?: readonly VisibilityEntry[];

  // Lifecycle. Every member below is invoked from exactly one place —
  // `instantiateLayer` — which is where to look to see the call shapes together.
  /** Mints the private Runtime, after `initGpu` and before `wireSlots`. */
  create(deps: LayerCoreDeps<Facts>): Runtime;
  /** Run at teardown via the instance closure. WebGPU frees nothing on GC: release
   * what `create` took, subsystems before the renderers they hold. */
  destroy(runtime: Runtime): void;

  // Runtime-bound contributions: closures over the Layer's own state.
  /** Appended after `CONTENT_PASSES` in `createLayers`; names are globally unique —
   * a duplicate throws at boot. */
  passes(runtime: Runtime): readonly ContentPass[];
  /** Appended after `CORE_COMPUTES` in `createLayers`; names are globally unique —
   * a duplicate throws at boot, and a name `FRAME_ORDER` never lists just never runs. */
  computes?(runtime: Runtime): readonly ContentCompute[];
  /** Rows join core's table in `createLayers`, which builds, wires and demand-drives
   * the slots behind them. */
  assets?(runtime: Runtime): readonly (AssetWiringRow | CompanionAssetRow)[];
  /** Three independent row sets, each composed in `createLayers`: `screenLabels` rows register
   * with the director of the slab they name, then poll once a frame like any
   * other screen-space producer; `worldLabels` rows join
   * `state.label3DProducers`, walked by `runLabel3DProducers`; `orbitTrails` rows
   * join `state.orbitTrailRows`, walked by `orbitTrailsPass`. Each label `id`
   * must be stable across frames. */
  guides?(runtime: Runtime): LayerGuides;
  /** Folded by `composeSelectionRows`; `pickSources` are disjoint across Layers,
   * asserted at boot. */
  selection?(runtime: Runtime): readonly SelectionKindRow[];
  /** Palette rows. Each yield REPLACES this Layer's previous snapshot; a static
   * Layer yields once. Core runs it as a saga beside `sagas`, cancelled at teardown. */
  search?(runtime: Runtime): AsyncIterable<readonly LayerSearchEntry[]>;
  /** Per-source counts on the same terms. Core dispatches `engineSourceCountReported`
   * per yield and keeps its ready-total / contentVersion side effects. */
  sourceCounts?(runtime: Runtime): AsyncIterable<SourceCountReport>;
  /** Composed into `state.planners` by `createLayers`; a row's own `FrameSection`
   * line is hand-authored, same as a compute row's. */
  planners?(runtime: Runtime): readonly FrameContentPlanner<unknown>[];
  /** The ground core's camera reads. At most one provider per composition —
   *  createLayers throws on two; with none, core reads FLAT_TERRAIN. */
  terrain?(runtime: Runtime): LayerTerrain;
};
