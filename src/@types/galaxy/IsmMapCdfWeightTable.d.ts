import type { IsmMapCdfChannelWeights } from './IsmMapCdfChannelWeights';
import type { IsmMapCdfArmEnvelopeEntry } from './IsmMapCdfArmEnvelopeEntry';

/**
 * 'channel': dust density for `placeDust` — the per-texel channel
 * dot, ring-mean-normalised and optionally capped by `ringCap`
 * (`dustParticleCloud.ts`'s `density()` closure, :208-218 — `cloud.
 * dustPlacementCap`, `<=0`/omitted is that field's own "uncapped"
 * convention). 'armBiased': `placeDigVeil` — the bare channel dot
 * (no ring normalisation), reweighted toward `entries`' packed ridge
 * envelope (`buildArmProximityEnvelope`/`armBiasedDensity`,
 * `hiiRegions.ts:484-539`). `entries` is ring-major, length `rings *
 * armCount` — see `packIsmMapCdfArmEnvelope.ts`'s own doc for how a caller
 * fills it (one `refresh(radius)` per ring, not per texel).
 */
export type IsmMapCdfWeightTable =
  | {
      readonly kind: 'channel';
      readonly channelWeights: IsmMapCdfChannelWeights;
      readonly ringCap?: number;
    }
  | {
      readonly kind: 'armBiased';
      readonly channelWeights: IsmMapCdfChannelWeights;
      readonly armBias: number;
      readonly armCount: number;
      readonly entries: readonly IsmMapCdfArmEnvelopeEntry[];
    };
