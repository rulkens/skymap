import type { PositionedId } from '../../scene/PositionedId';

/** The focus as the arms see it: none, a positioned body, or one with no body (a galaxy, a survey star). */
export type ArmFocus =
  | { readonly kind: 'none' }
  | { readonly kind: 'body'; readonly id: PositionedId }
  | { readonly kind: 'bodiless' };
