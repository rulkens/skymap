import type { FadeValueOf } from './FadeValueOf';
import type { VisibilityAddress } from './VisibilityAddress';

/** The trailing value parameter of a pass, planner or label producer, as a rest tuple:
 * required once `A` is narrowed, optional on the erased type. A narrowed one still fits an
 * erased list because method parameters compare bivariantly. */
export type FadeParam<A extends Erased, Erased extends VisibilityAddress> = [Erased] extends [A]
  ? [fade?: FadeValueOf<A>]
  : [fade: FadeValueOf<A>];
