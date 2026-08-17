import type { LabelLayerId } from './LabelLayerId';

/**
 * CategoryLabelLayer — the fade layers a label-bearing *category* can route to.
 *
 * This is the subset of `LabelLayerId` reachable from a SOURCE_REGISTRY row's
 * `labelLayer` field. `scaleBar` is the only excluded layer — a React-side HUD
 * element with no owning source row. Every other layer IS category-routable:
 * each is produced by a registry row like any other category.
 *
 * Derived from `LabelLayerId` via `Exclude` rather than re-spelled, so the
 * subset can never name a layer that doesn't exist on the fade registry — and
 * a new label layer is category-routable by default, which is the common case.
 */
export type CategoryLabelLayer = Exclude<LabelLayerId, 'scaleBar'>;
