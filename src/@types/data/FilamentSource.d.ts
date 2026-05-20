import { SOURCE_REGISTRY } from '../../data/sources';

/**
 * Source codes whose `SOURCE_REGISTRY` entry has `type: 'filament'` —
 * derived from the registry rather than listed explicitly, so adding
 * a filament asset is a single-place edit.
 */
export type FilamentSource = {
  [K in keyof typeof SOURCE_REGISTRY]: (typeof SOURCE_REGISTRY)[K] extends { type: 'filament' }
    ? (typeof SOURCE_REGISTRY)[K]['code']
    : never;
}[keyof typeof SOURCE_REGISTRY];
