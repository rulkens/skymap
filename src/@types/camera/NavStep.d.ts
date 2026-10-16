import type { NavAxis } from './NavAxis';
import type { Vec2 } from '../math/Vec2';

/** NavStep — the subsequence of the frame's InputSteps the navigator reads. */
export type NavStep =
  | { readonly kind: 'navDrag'; readonly axis: NavAxis; readonly deltaPx: Vec2 }
  | { readonly kind: 'gestureEnd' };
