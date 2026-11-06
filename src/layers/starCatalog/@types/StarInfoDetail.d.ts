/**
 * StarInfoDetail — the block a star's card renders below the shared rows,
 * keyed by its SHAPE rather than which catalog it came from, so a future
 * curated catalog reuses `curated` instead of growing a branch. `none` is
 * real: an unlanded famous-star sidecar renders its headline alone, and so
 * does `starDetail`'s non-S-star fallthrough.
 */

import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';
import type { StarOrbitInfo } from '../../../@types/engine/StarOrbitInfo';

export type StarInfoDetail =
  | {
      readonly kind: 'photometry';
      readonly absMag: number;
      readonly apparentMag: number;
      readonly bpRp: number;
      readonly spectralClass: string;
    }
  | { readonly kind: 'curated'; readonly meta: FamousStarMetaEntry }
  | { readonly kind: 'orbit'; readonly orbit: StarOrbitInfo }
  | { readonly kind: 'none' };
