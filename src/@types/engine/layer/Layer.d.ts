/**
 * Layer — one self-contained slice of the scene: static contributions as plain data,
 * runtime-bound ones as closures over the private `Runtime` its own `create` mints
 * (opaque to core, which only hands it back to the same Layer's methods). The trailing
 * type parameters default to their erased bounds — `Facts` included — so
 * `Layer<string, unknown>` still satisfies the composition constraint.
 */

import type { SettingsFragmentLike } from '../../settings/SettingsFragmentLike';
import type { RenderTargetSpec } from '../frame/RenderTargetSpec';
import type { ContentPass } from '../frame/ContentPass';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { Label2DProducer } from '../subsystems/Label2DProducer';
import type { SourceType } from '../../data/SourceType';
import type { SourceEntry } from '../../data/SourceEntry';
import type { LayerCoreDeps } from './LayerCoreDeps';
import type { LayerUiSection } from './LayerUiSection';
import type { SagaFactory } from './SagaFactory';
import type { SelectionKindRow } from './SelectionKindRow';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { PassState } from '../frame/PassState';

export type Layer<
  Name extends string,
  Runtime,
  Settings extends readonly SettingsFragmentLike[] = readonly SettingsFragmentLike[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly (readonly [
    SourceType,
    SourceEntry,
  ])[],
  Facts = unknown,
> = {
  /** Unique across the composition; also the key this Layer's `facts` sit under in `state.engine`. */
  readonly name: Name;

  /** Folded into the app's fragment list by `appSettingsFragments`. Absent = no knobs. */
  readonly settings?: Settings;

  // Static contributions: plain data, readable without booting anything.
  /** Offscreen targets this Layer needs. Nothing declares one yet. */
  readonly targets?: readonly RenderTargetSpec[];
  /** Each runs as its own root task via `createLayers`, cancelled at teardown — not
   * folded into `rootSaga`. Factories, not running sagas. */
  readonly sagas?: readonly SagaFactory[];
  /** Typing only: `data/sources.ts` folds the same rows into `SOURCE_REGISTRY` by import. */
  readonly sources?: Sources;
  /** Seeded into `state.engine[name]` by `createLayers`; const-inferred, read back via `FactsOf`. */
  readonly facts?: Facts;
  /** Rendered by `SettingsPanel`: a hand-written component, never generated. */
  readonly ui?: LayerUiSection;

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
  /** Rows join core's table in `createLayers`, which builds, wires and demand-drives
   * the slots behind them. */
  assets?(runtime: Runtime): readonly (AssetWiringRow | CompanionAssetRow)[];
  /** Rows join `FADE_LAYERS` in `createLayers`. Declares only: core owns the arrival
   * edge (`installFadeOnArrival`), so never drive a fade from `create`. */
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  /** Registered with the label director in `createLayers`, then polled once a frame;
   * each `id` must be stable across frames. */
  labels?(runtime: Runtime): readonly Label2DProducer[];
  /** Folded by `composeSelectionRows`; `pickSources` are disjoint across Layers,
   * asserted at boot. */
  selection?(runtime: Runtime): readonly SelectionKindRow[];
  /**
   * Called from `runFrame` once a frame, after the focus uniform and before any pass.
   * `true` keeps the loop awake and defers sky captures, so a capture never bakes
   * half-arrived content.
   */
  frame?(runtime: Runtime): (ctx: ReadyFrameContext, state: PassState) => boolean;
};
