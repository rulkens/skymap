/**
 * Layer — one self-contained slice of the scene, stating everything core needs to know
 * about it: static contributions as plain data, and runtime-bound ones as closures over
 * the private `Runtime` its own `create` mints. `Runtime` is opaque to core, which only
 * ever hands it back to the same Layer's own methods.
 */

import type { SettingsFragmentLike } from '../../settings/SettingsFragmentLike';
import type { RenderTargetSpec } from '../frame/RenderTargetSpec';
import type { ContentPass } from '../frame/ContentPass';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { Label2DProducer } from '../subsystems/Label2DProducer';
import type { SourceType } from '../../data/SourceType';
import type { SourceEntry } from '../../data/SourceEntry';
import type { LayerCoreDeps } from './LayerCoreDeps';
import type { LayerUiSection } from './LayerUiSection';
import type { SagaFactory } from './SagaFactory';
import type { PickResolverRow } from './PickResolverRow';

export type Layer<Name extends string, Runtime> = {
  readonly name: Name;

  /** This Layer's settings clusters. Absent = no knobs. */
  readonly settings?: readonly SettingsFragmentLike[];

  // Static contributions: plain data, readable without booting anything.
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  /** This Layer's `SOURCE_REGISTRY` rows, keyed by their global `Source` code. */
  readonly sources?: readonly (readonly [SourceType, SourceEntry])[];
  /** The SettingsPanel section: a hand-written component, never generated. */
  readonly ui?: LayerUiSection;

  // Lifecycle: this Layer's private renderers, subsystems, data store and asset slots.
  create(deps: LayerCoreDeps): Runtime;
  destroy(runtime: Runtime): void;

  // Runtime-bound contributions: closures over the Layer's own state.
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  pick?(runtime: Runtime): readonly PickResolverRow[];
};
