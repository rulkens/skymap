import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';
import type { StellarStreamMeta } from '../catalog/@types/StellarStreamMeta';
import type { StellarStreamsPayload } from '../catalog/@types/StellarStreamsPayload';
import type { StellarStreamsRenderer } from '../streaks/@types/StellarStreamsRenderer';

export type StellarStreamsRuntime = {
  readonly renderer: StellarStreamsRenderer;
  /** Blits the half-res haze target into HDR. */
  readonly hazeUpsample: AdditiveUpsample;
  readonly slot: AssetSlot<StellarStreamsPayload, void>;
  readonly metaSlot: AssetSlot<readonly StellarStreamMeta[], void>;
  /** The committed meta, or null. */
  readonly meta: () => readonly StellarStreamMeta[] | null;
  /** The streaks' pick code; the pick stamp and the selection row both pack it. */
  readonly pickCode: number;
};
