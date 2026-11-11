/**
 * What a row addresses in the authored draft: the clip's start, an effect by its path, or one
 * waypoint (by index) of the flyPath at `path`. Serializable, so it rides in actions and state.
 */
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export type RowRef =
  | { readonly kind: 'start' }
  | { readonly kind: 'effect'; readonly path: EffectPath }
  | { readonly kind: 'waypoint'; readonly path: EffectPath; readonly index: number };
