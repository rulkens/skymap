import { SOURCE_REGISTRY } from '../../data/sources';

/**
 * Source codes whose `SOURCE_REGISTRY` entry has `type: 'structure'` — the
 * marker-ring anchors used by the pick encoding (cluster / supercluster /
 * void / group). Derived from the registry rather than listed explicitly.
 */
export type StructureSource = {
  [K in keyof typeof SOURCE_REGISTRY]: (typeof SOURCE_REGISTRY)[K] extends { type: 'structure' }
    ? (typeof SOURCE_REGISTRY)[K]['code']
    : never;
}[keyof typeof SOURCE_REGISTRY];
