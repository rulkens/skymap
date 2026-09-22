/**
 * StarInfoDetail — the block a star's card renders below the rows every star
 * shares, keyed by its SHAPE rather than by which catalog the star came from:
 * the card renders what it is handed, so a future seeded catalog with curated
 * copy reuses `curated` instead of growing a branch. `none` is a real arm — the
 * Sun has nothing of its own yet, and a famous star whose sidecar has not landed
 * renders its headline alone rather than a loading state.
 *
 * Core for the same reason as `StarInfo`, which carries it: `buildFocusable`
 * chooses the arm.
 */

import type { FamousStarMetaEntry } from '../loading/FamousStarMetaEntry';
import type { StarOrbitInfo } from './StarOrbitInfo';

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
