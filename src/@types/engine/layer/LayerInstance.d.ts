import type { LayerFrameVote } from './LayerFrameVote';
import type { SelectionKindRow } from './SelectionKindRow';
import type { ContentPass } from '../frame/ContentPass';
import type { ContentCompute } from '../frame/ContentCompute';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { LayerScreenLabel } from './LayerScreenLabel';
import type { Label3DProducer } from '../subsystems/Label3DProducer';
import type { FrameView } from '../frame/FrameView';
import type { PassState } from '../frame/PassState';

/** A Layer bound to its own `Runtime` by `instantiateLayer`, once, at `createLayers`. */
export type LayerInstance = {
  readonly name: string;
  readonly passes: readonly ContentPass[];
  readonly computes: readonly ContentCompute[];
  /** Authored rows: core folds companions once, over core's rows and every Layer's. */
  readonly assets: readonly (AssetWiringRow | CompanionAssetRow)[];
  readonly fades: readonly FadeLayer<unknown>[];
  readonly screenLabels: readonly LayerScreenLabel[];
  readonly worldLabels: readonly Label3DProducer[];
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: FrameView, state: PassState) => LayerFrameVote) | null;
  destroy(): void;
};
