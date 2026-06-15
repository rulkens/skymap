import { SOURCE_REGISTRY } from '../../../data/sources';

/**
 * Source codes whose `SOURCE_REGISTRY` entry has `type: 'volume'` —
 * derived from the registry rather than listed explicitly, so adding
 * a production volume cube is a single-place edit.
 */
export type VolumeSource = {
  [K in keyof typeof SOURCE_REGISTRY]: (typeof SOURCE_REGISTRY)[K] extends { type: 'volume' }
    ? (typeof SOURCE_REGISTRY)[K]['code']
    : never;
}[keyof typeof SOURCE_REGISTRY];
