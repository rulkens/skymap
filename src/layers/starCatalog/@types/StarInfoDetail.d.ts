/**
 * StarInfoDetail — the block a star's card renders below the shared rows,
 * keyed by its SHAPE rather than which catalog it came from. A seeded star's
 * curated sidecar entry is not an arm: the card's container looks it up in the
 * Layer's `famousStarsMeta` fact and it outranks `orbit`/`none`, so `none` is
 * real for a seeded star whose sidecar has not landed or omits it.
 */

import type { StarOrbitInfo } from '../../../@types/engine/StarOrbitInfo';

export type StarInfoDetail =
  | {
      readonly kind: 'photometry';
      readonly absMag: number;
      readonly apparentMag: number;
      readonly bpRp: number;
      readonly spectralClass: string;
    }
  | { readonly kind: 'orbit'; readonly orbit: StarOrbitInfo }
  | { readonly kind: 'none' };
