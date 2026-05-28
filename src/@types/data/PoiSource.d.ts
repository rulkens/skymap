import { SOURCE_REGISTRY } from '../../data/sources';

/**
 * Source codes whose `SOURCE_REGISTRY` entry has `type: 'poi'` — markers
 * used by the pick encoding (cluster / supercluster / void anchors).
 * Derived from the registry rather than listed explicitly.
 */
export type PoiSource = {
  [K in keyof typeof SOURCE_REGISTRY]: (typeof SOURCE_REGISTRY)[K] extends { type: 'poi' }
    ? (typeof SOURCE_REGISTRY)[K]['code']
    : never;
}[keyof typeof SOURCE_REGISTRY];
