import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StellarStreamMeta } from '../catalog/@types/StellarStreamMeta';
import type { StellarStreamsPayload } from '../catalog/@types/StellarStreamsPayload';
import type { StellarStreamsRenderer } from '../streaks/@types/StellarStreamsRenderer';

export type StellarStreamsRuntime = {
  readonly renderer: StellarStreamsRenderer;
  readonly slot: AssetSlot<StellarStreamsPayload, void>;
  readonly metaSlot: AssetSlot<readonly StellarStreamMeta[], void>;
  /** The committed meta, or null. */
  readonly meta: () => readonly StellarStreamMeta[] | null;
  /** The streaks' pick code; the pick stamp and the selection row both pack it. */
  readonly pickCode: number;
};
