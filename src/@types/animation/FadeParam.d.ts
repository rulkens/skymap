import type { FadeValueOf } from './FadeValueOf';
import type { VisibilityAddress } from './VisibilityAddress';

/**
 * The trailing value parameter of a pass, planner or label producer, as a rest tuple. Required
 * once `A` names its addresses; optional on the erased type (`A` = all of `Erased`), so a
 * consumer that declares nothing, and core calling the gated wrapper, keep their shorter
 * calls. A specific one still fits an erased list: a required parameter may stand where the
 * target's is optional, and method parameters compare bivariantly.
 */
export type FadeParam<A extends Erased, Erased extends VisibilityAddress> = [Erased] extends [A]
  ? [fade?: FadeValueOf<A>]
  : [fade: FadeValueOf<A>];
