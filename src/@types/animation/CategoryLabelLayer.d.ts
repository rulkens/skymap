import type { LabelLayerId } from './LabelLayerId';

/**
 * CategoryLabelLayer — the fade layers a label-bearing *category* can route to.
 *
 * This is the subset of `LabelLayerId` reachable from a SOURCE_REGISTRY row's
 * `labelLayer` field. The other two layers (`youAreHere`, `scaleBar`) are
 * singleton overlays with no owning category, so they're excluded here.
 *
 * Derived from `LabelLayerId` via `Extract` rather than re-spelled, so the
 * subset can never name a layer that doesn't exist on the fade registry — and
 * renaming a layer in `LabelLayerId` propagates here for free.
 */
export type CategoryLabelLayer = Extract<LabelLayerId, 'galaxyNames' | 'structure'>;
