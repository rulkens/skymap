import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';

/**
 * What a card says per source. The N-body Sagittarius's `lengthKpc` spans its debris from end to
 * end (twice the p99 reach from the remnant), so it reads "Extent"; a galstreams track's is an arc
 * length along the track.
 */
export const STELLAR_STREAM_SOURCE_FACTS: Record<
  StellarStreamMeta['source'],
  {
    readonly kind: string;
    readonly sizeLabel: string;
  }
> = {
  vasiliev2021: {
    kind: 'Dwarf-galaxy debris, N-body model',
    sizeLabel: 'Extent',
  },
  galstreams: {
    kind: 'Stellar stream',
    sizeLabel: 'Length',
  },
};
