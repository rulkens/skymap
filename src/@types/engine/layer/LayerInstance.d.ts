import type { TerrainHeightAtLookup } from '../../camera/terrain/TerrainHeightAtLookup';
import type { FrameContentPlanner } from '../frame/FrameContentPlanner';
import type { LayerSearchEntry } from './LayerSearchEntry';
import type { SelectionKindRow } from './SelectionKindRow';
import type { SourceCountReport } from './SourceCountReport';
import type { ContentPass } from '../frame/ContentPass';
import type { ContentCompute } from '../frame/ContentCompute';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { LabelSource } from './LabelSource';
import type { LayerWorldLabel } from './LayerWorldLabel';
import type { OrbitTrailGroup } from './OrbitTrailGroup';
import type { SampledTrailGroup } from './SampledTrailGroup';

/** A Layer bound to its own `Runtime` by `instantiateLayer`, once, at `createLayers`. */
export type LayerInstance = {
  readonly name: string;
  readonly passes: readonly ContentPass[];
  readonly computes: readonly ContentCompute[];
  readonly planners: readonly FrameContentPlanner<unknown>[];
  /** Authored rows: core folds companions once, over every Layer's rows. */
  readonly assets: readonly (AssetWiringRow | CompanionAssetRow)[];
  readonly screenLabels: readonly LabelSource<unknown>[];
  readonly worldLabels: readonly LayerWorldLabel[];
  /** `[]` or `[the Layer's group]`. */
  readonly orbitTrails: readonly OrbitTrailGroup[];
  /** `[]` or `[the Layer's group]`. */
  readonly sampledTrails: readonly SampledTrailGroup[];
  readonly selection: readonly SelectionKindRow[];
  /** Bound feeds, absent when the Layer declares no such member; `createLayers`
   * runs each as its own `runLayerFeedSaga` task, cancelled with the Layer's sagas. */
  readonly search?: AsyncIterable<readonly LayerSearchEntry[]>;
  readonly sourceCounts?: AsyncIterable<SourceCountReport>;
  readonly heightAt?: TerrainHeightAtLookup;
  destroy(): void;
};
