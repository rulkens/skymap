import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { StellarStreamMeta } from '../catalog/@types/StellarStreamMeta';
import type { StellarStreamsPayload } from '../catalog/@types/StellarStreamsPayload';
import type { StellarStreamsRenderer } from '../streaks/@types/StellarStreamsRenderer';
import type { StellarStreamsRibbonPickRenderer } from '../streaks/@types/StellarStreamsRibbonPickRenderer';

export type StellarStreamsRuntime = {
  readonly renderer: StellarStreamsRenderer;
  /** The pick: ribbons along the meta's centrelines. */
  readonly ribbonPick: StellarStreamsRibbonPickRenderer;
  /** Blits the half-res haze target into HDR. */
  readonly hazeUpsample: AdditiveUpsample;
  readonly slot: AssetSlot<StellarStreamsPayload, void>;
  readonly metaSlot: AssetSlot<readonly StellarStreamMeta[], void>;
  /** The committed meta, or null. */
  readonly meta: () => readonly StellarStreamMeta[] | null;
  /** The streams' pick code; the ribbons, the captions and the selection row all pack it. */
  readonly pickCode: number;
};
