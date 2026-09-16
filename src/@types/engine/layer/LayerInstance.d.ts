import type { SelectionKindRow } from './SelectionKindRow';
import type { ContentPass } from '../frame/ContentPass';
import type { AssetWiringRow } from '../../loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../loading/CompanionAssetRow';
import type { FadeLayer } from '../../animation/FadeLayer';
import type { Label2DProducer } from '../subsystems/Label2DProducer';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { PassState } from '../frame/PassState';

/** A Layer bound to its own `Runtime` by `instantiateLayer`, once, at `createLayers`. */
export type LayerInstance = {
  readonly name: string;
  readonly passes: readonly ContentPass[];
  /** Authored rows: core folds companions once, over core's rows and every Layer's. */
  readonly assets: readonly (AssetWiringRow | CompanionAssetRow)[];
  readonly fades: readonly FadeLayer<unknown>[];
  readonly labels: readonly Label2DProducer[];
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: ReadyFrameContext, state: PassState) => boolean) | null;
  destroy(): void;
};
