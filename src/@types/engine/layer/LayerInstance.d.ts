import type { FrameContentPlanner } from '../frame/FrameContentPlanner';
import type { LayerSearchEntry } from './LayerSearchEntry';
import type { SelectionKindRow } from './SelectionKindRow';
import type { SourceCountReport } from './SourceCountReport';
import type { ContentPass } from '../frame/ContentPass';
import type { ContentCompute } from '../frame/ContentCompute';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { LayerScreenLabel } from './LayerScreenLabel';
import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { OrbitalElements } from '../../scene/OrbitalElements';

/** A Layer bound to its own `Runtime` by `instantiateLayer`, once, at `createLayers`. */
export type LayerInstance = {
  readonly name: string;
  readonly passes: readonly ContentPass[];
  readonly computes: readonly ContentCompute[];
  readonly planners: readonly FrameContentPlanner<unknown>[];
  /** Authored rows: core folds companions once, over core's rows and every Layer's. */
  readonly assets: readonly (AssetWiringRow | CompanionAssetRow)[];
  readonly fades: readonly FadeLayer<unknown>[];
  readonly screenLabels: readonly LayerScreenLabel[];
  readonly worldLabels: readonly Label3DProducer[];
  readonly orbitTrails: readonly OrbitalElements[];
  readonly selection: readonly SelectionKindRow[];
  /** Bound feeds, absent when the Layer declares no such member; `createLayers`
   * runs each as its own `runLayerFeedSaga` task, cancelled with the Layer's sagas. */
  readonly search?: AsyncIterable<readonly LayerSearchEntry[]>;
  readonly sourceCounts?: AsyncIterable<SourceCountReport>;
  destroy(): void;
};
